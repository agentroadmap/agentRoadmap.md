import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { join } from "node:path";
import { FileSystem } from "../file-system/operations.ts";
import { RoadmapServer } from "../server/index.ts";
import type { Decision, Document, State } from "../types/index.ts";
import { createUniqueTestDir, retry, safeCleanup } from "./test-utils.ts";

let TEST_DIR: string;
let server: RoadmapServer | null = null;
let filesystem: FileSystem;
let serverPort = 0;

const baseState: State = {
	id: "STATE-0007",
	title: "Server search state",
	status: "In Progress",
	assignee: ["@codex"],
	reporter: "@codex",
	createdDate: "2025-09-20 10:00",
	updatedDate: "2025-09-20 10:00",
	labels: ["search"],
	dependencies: [],
	description: "Alpha token appears here",
	priority: "high",
};

const baseDoc: Document = {
	id: "doc-9001",
	title: "Search Handbook",
	type: "guide",
	createdDate: "2025-09-20",
	updatedDate: "2025-09-20",
	rawContent: "# Guide\nAlpha document guidance",
};

const baseDecision: Decision = {
	id: "decision-9001",
	title: "Centralize search",
	date: "2025-09-19",
	status: "accepted",
	context: "Need consistent Alpha search coverage",
	decision: "Adopt shared Fuse service",
	consequences: "Shared index",
	rawContent: "## Context\nAlpha adoption",
};

const dependentState: State = {
	id: "STATE-0008",
	title: "Follow-up integration",
	status: "In Progress",
	assignee: ["@codex"],
	reporter: "@codex",
	createdDate: "2025-09-20 10:30",
	updatedDate: "2025-09-20 10:30",
	labels: ["search"],
	dependencies: [baseState.id],
	description: "Depends on state-0007 for completion",
	priority: "medium",
};

describe("RoadmapServer search endpoint", () => {
	beforeEach(async () => {
		TEST_DIR = createUniqueTestDir("server-search");
		filesystem = new FileSystem(TEST_DIR);
		await filesystem.ensureRoadmapStructure();
		await filesystem.saveConfig({
			projectName: "Server Search",
			statuses: ["To Do", "In Progress", "Done"],
			labels: [],
			milestones: [],
			dateFormat: "YYYY-MM-DD",
			remoteOperations: false,
		});

		await filesystem.saveState(baseState);
		await filesystem.saveState(dependentState);
		await filesystem.saveDocument(baseDoc);
		await filesystem.saveDecision(baseDecision);

		server = new RoadmapServer(TEST_DIR);
		await server.start(0, false);
		const port = server.getPort();
		expect(port).not.toBeNull();
		serverPort = port ?? 0;
		expect(serverPort).toBeGreaterThan(0);

		await retry(
			async () => {
				const states = await fetchJson<State[]>("/api/states");
				expect(states.length).toBeGreaterThan(0);
				return states;
			},
			10,
			100,
		);
	});

	afterEach(async () => {
		if (server) {
			await server.stop();
			server = null;
		}
		await safeCleanup(TEST_DIR);
	});

	it("returns states, documents, and decisions from the shared search service", async () => {
		const results = await retry(
			async () => {
				const data = await fetchJson<Array<{ type?: string }>>("/api/search?query=alpha");
				const typeSet = new Set(data.map((item) => item.type));
				if (!typeSet.has("state") || !typeSet.has("document") || !typeSet.has("decision")) {
					throw new Error("Search results not yet indexed for all types");
				}
				return data;
			},
			20,
			100,
		);
		const finalTypes = new Set(results.map((item) => item.type));
		expect(finalTypes.has("state")).toBe(true);
		expect(finalTypes.has("document")).toBe(true);
		expect(finalTypes.has("decision")).toBe(true);
	});

	it("filters search results by priority and status", async () => {
		const url = "/api/search?type=state&status=In%20Progress&priority=high&query=search";
		const results = await fetchJson<Array<{ type: string; state?: State }>>(url);
		expect(results).toHaveLength(1);
		expect(results[0]?.type).toBe("state");
		expect(results[0]?.state?.id).toBe(baseState.id);
	});

	it("filters state listings by priority via the content store", async () => {
		const states = await fetchJson<State[]>("/api/states?priority=high");
		expect(states).toHaveLength(1);
		expect(states[0]?.id).toBe(baseState.id);
	});

	it("rejects unsupported priority filters with 400", async () => {
		await expect(fetchJson<State[]>("/api/states?priority=urgent")).rejects.toThrow();
	});

	it("supports zero-padded ids and dependency-aware search", async () => {
		const viaLooseId = await fetchJson<State>("/api/state/7");
		expect(viaLooseId.id).toBe(baseState.id);

		const paddedViaSearch = await fetchJson<Array<{ type: string; state?: State }>>("/api/search?type=state&query=state-7");
		const paddedIds = paddedViaSearch.filter((result) => result.type === "state").map((result) => result.state?.id);
		expect(paddedIds).toContain(baseState.id);

		const shortQueryResults = await fetchJson<Array<{ type: string; state?: State }>>("/api/search?type=state&query=7");
		const shortIds = shortQueryResults.filter((result) => result.type === "state").map((result) => result.state?.id);
		expect(shortIds).toContain(baseState.id);

		const dependencyMatches = await fetchJson<Array<{ type: string; state?: State }>>(
			"/api/search?type=state&query=state-0007",
		);
		const dependencyIds = dependencyMatches
			.filter((result) => result.type === "state")
			.map((result) => result.state?.id)
			.filter((id): id is string => Boolean(id));
		expect(dependencyIds).toEqual(expect.arrayContaining([baseState.id, dependentState.id]));
	});

	it("returns newly created states immediately after POST", async () => {
		const createResponse = await fetch(`http://127.0.0.1:${serverPort}/api/states`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				title: "Immediate fetch",
				status: "In Progress",
				description: "Immediate availability",
			}),
		});
		expect(createResponse.ok).toBe(true);
		const created = (await createResponse.json()) as State;
		expect(created.title).toBe("Immediate fetch");
		const shortId = created.id.replace(/^state-/i, "");
		const fetched = await fetchJson<State>(`/api/state/${shortId}`);
		expect(fetched.id).toBe(created.id);
		expect(fetched.title).toBe("Immediate fetch");
	});

	it("persists milestone when creating states via POST", async () => {
		const createResponse = await fetch(`http://127.0.0.1:${serverPort}/api/states`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				title: "Milestone create",
				status: "To Do",
				milestone: "m-2",
			}),
		});
		expect(createResponse.ok).toBe(true);
		const created = (await createResponse.json()) as State;
		expect(created.milestone).toBe("m-2");

		const shortId = created.id.replace(/^state-/i, "");
		const fetched = await fetchJson<State>(`/api/state/${shortId}`);
		expect(fetched.milestone).toBe("m-2");

		const milestoneCreate = await fetch(`http://127.0.0.1:${serverPort}/api/milestones`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				title: "Numeric Alias Milestone",
			}),
		});
		expect(milestoneCreate.status).toBe(201);
		const createdMilestone = (await milestoneCreate.json()) as { id: string };
		const numericAlias = createdMilestone.id.replace(/^m-/i, "");

		const numericAliasStateCreate = await fetch(`http://127.0.0.1:${serverPort}/api/states`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				title: "Numeric alias state",
				status: "To Do",
				milestone: numericAlias,
			}),
		});
		expect(numericAliasStateCreate.status).toBe(201);
		const numericAliasState = (await numericAliasStateCreate.json()) as State;
		expect(numericAliasState.milestone).toBe(createdMilestone.id);

		const titleAliasMilestoneCreate = await fetch(`http://127.0.0.1:${serverPort}/api/milestones`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				title: "1",
			}),
		});
		expect(titleAliasMilestoneCreate.status).toBe(201);

		const idPriorityMilestoneCreate = await fetch(`http://127.0.0.1:${serverPort}/api/milestones`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				title: "ID priority milestone",
			}),
		});
		expect(idPriorityMilestoneCreate.status).toBe(201);

		const idPriorityStateCreate = await fetch(`http://127.0.0.1:${serverPort}/api/states`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				title: "ID priority state",
				status: "To Do",
				milestone: "1",
			}),
		});
		expect(idPriorityStateCreate.status).toBe(201);
		const idPriorityState = (await idPriorityStateCreate.json()) as State;
		expect(idPriorityState.milestone).toBe("m-1");
	});

	it("resolves numeric milestone aliases to zero-padded legacy milestone IDs", async () => {
		await Bun.write(
			join(filesystem.milestonesDir, "m-01 - legacy-release.md"),
			`---
id: m-01
title: "Legacy Release"
---

## Description

Milestone: Legacy Release
`,
		);

		const createResponse = await fetch(`http://127.0.0.1:${serverPort}/api/states`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				title: "Legacy alias state",
				status: "To Do",
				milestone: "1",
			}),
		});
		expect(createResponse.status).toBe(201);
		const created = (await createResponse.json()) as State;
		expect(created.milestone).toBe("m-01");

		const updateResponse = await fetch(`http://127.0.0.1:${serverPort}/api/states/${created.id}`, {
			method: "PUT",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				milestone: "m-1",
			}),
		});
		expect(updateResponse.status).toBe(200);
		const updated = (await updateResponse.json()) as State;
		expect(updated.milestone).toBe("m-01");
	});

	it("prefers canonical IDs when zero-padded and canonical milestone IDs both exist", async () => {
		await Bun.write(
			join(filesystem.milestonesDir, "m-1 - canonical-release.md"),
			`---
id: m-1
title: "Canonical Release"
---

## Description

Milestone: Canonical Release
`,
		);
		await Bun.write(
			join(filesystem.milestonesDir, "m-01 - zero-padded-release.md"),
			`---
id: m-01
title: "Zero-padded Release"
---

## Description

Milestone: Zero-padded Release
`,
		);

		const createResponse = await fetch(`http://127.0.0.1:${serverPort}/api/states`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				title: "Canonical tie-break state",
				status: "To Do",
				milestone: "1",
			}),
		});
		expect(createResponse.status).toBe(201);
		const created = (await createResponse.json()) as State;
		expect(created.milestone).toBe("m-1");
	});

	it("prefers archived milestone IDs over active title matches for ID-shaped state inputs", async () => {
		await Bun.write(
			join(filesystem.archiveMilestonesDir, "m-0 - archived-id.md"),
			`---
id: m-0
title: "Archived source"
---

## Description

Milestone: Archived source
`,
		);
		await Bun.write(
			join(filesystem.milestonesDir, "m-2 - active-id-shaped-title.md"),
			`---
id: m-2
title: "m-0"
---

## Description

Milestone: m-0
`,
		);

		const createResponse = await fetch(`http://127.0.0.1:${serverPort}/api/states`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				title: "Archived ID priority state",
				status: "To Do",
				milestone: "m-0",
			}),
		});
		expect(createResponse.status).toBe(201);
		const created = (await createResponse.json()) as State;
		expect(created.milestone).toBe("m-0");
	});

	it("rejects milestone titles that collide with existing milestone IDs", async () => {
		const firstCreate = await fetch(`http://127.0.0.1:${serverPort}/api/milestones`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				title: "Release Alias",
			}),
		});
		expect(firstCreate.status).toBe(201);
		const created = (await firstCreate.json()) as { id: string };

		const conflictCreate = await fetch(`http://127.0.0.1:${serverPort}/api/milestones`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				title: created.id.toUpperCase(),
			}),
		});
		expect(conflictCreate.status).toBe(400);
		const conflictPayload = (await conflictCreate.json()) as { error?: string };
		expect(conflictPayload.error).toContain("already exists");

		const numericAliasConflict = await fetch(`http://127.0.0.1:${serverPort}/api/milestones`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				title: created.id.replace(/^m-/i, ""),
			}),
		});
		expect(numericAliasConflict.status).toBe(400);
	});

	it("rebuilds the Fuse index when markdown content changes", async () => {
		await filesystem.saveDocument({
			...baseDoc,
			rawContent: "# Guide\nReindexed beta token",
		});

		await retry(
			async () => {
				const updated = await fetchJson<Array<{ type?: string }>>("/api/search?query=beta");
				if (!updated.some((item) => item.type === "document")) {
					throw new Error("Document not yet reindexed");
				}
				return updated;
			},
			40,
			125,
		);
	});
});

async function fetchJson<T>(path: string): Promise<T> {
	const response = await fetch(`http://127.0.0.1:${serverPort}${path}`);
	if (!response.ok) {
		throw new Error(`Request failed: ${response.status}`);
	}
	return response.json();
}
