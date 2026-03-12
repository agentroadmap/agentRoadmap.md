import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { ContentStore } from "../core/content-store.ts";
import { SearchService } from "../core/search-service.ts";
import { FileSystem } from "../file-system/operations.ts";
import type {
	Decision,
	DecisionSearchResult,
	Document,
	DocumentSearchResult,
	SearchResult,
	State,
	StateSearchResult,
} from "../types/index.ts";
import { createUniqueTestDir, getPlatformTimeout, safeCleanup, sleep } from "./test-utils.ts";

let TEST_DIR: string;

describe("SearchService", () => {
	let filesystem: FileSystem;
	let store: ContentStore;
	let search: SearchService;

	const baseState: State = {
		id: "state-1",
		title: "Centralized search state",
		status: "In Progress",
		assignee: ["@codex"],
		reporter: "@codex",
		createdDate: "2025-09-19 09:00",
		updatedDate: "2025-09-19 09:10",
		labels: ["search"],
		dependencies: [],
		rawContent: "## Description\nImplements Fuse based service",
		priority: "high",
	};

	const baseDoc: Document = {
		id: "doc-1",
		title: "Search Architecture",
		type: "guide",
		createdDate: "2025-09-19",
		rawContent: "# Search Architecture\nCentralized description",
	};

	const baseDecision: Decision = {
		id: "decision-1",
		title: "Adopt Fuse.js",
		date: "2025-09-18",
		status: "accepted",
		context: "Need consistent search",
		decision: "Use Fuse.js with centralized store",
		consequences: "Shared search path",
		rawContent: "## Context\nNeed consistent search\n\n## Decision\nUse Fuse.js with centralized store",
	};

	beforeEach(async () => {
		TEST_DIR = createUniqueTestDir("search-service");
		filesystem = new FileSystem(TEST_DIR);
		await filesystem.ensureRoadmapStructure();
		store = new ContentStore(filesystem);
		search = new SearchService(store);
	});

	afterEach(async () => {
		search?.dispose();
		store?.dispose();
		try {
			await safeCleanup(TEST_DIR);
		} catch {
			// ignore cleanup errors between tests
		}
	});

	it("indexes states, documents, and decisions and returns combined results", async () => {
		await filesystem.saveState(baseState);
		await filesystem.saveDocument(baseDoc);
		await filesystem.saveDecision(baseDecision);

		await search.ensureInitialized();

		const results = search.search({ query: "centralized" });
		expect(results).toHaveLength(3);

		const stateResult = results.find(isStateResult);
		expect(stateResult).toBeDefined();
		expect(stateResult?.state.id).toBe("STATE-1");
		expect(stateResult?.score).not.toBeNull();

		const docResult = results.find(isDocumentResult);
		expect(docResult?.document.id).toBe("doc-1");
		const decisionResult = results.find(isDecisionResult);
		expect(decisionResult?.decision.id).toBe("decision-1");
	});

	it("applies status and priority filters without running a text query", async () => {
		const secondState: State = {
			...baseState,
			id: "state-2",
			title: "Another state",
			status: "To Do",
			priority: "low",
			rawContent: "## Description\nSecondary",
		};

		const thirdState: State = {
			...baseState,
			id: "state-3",
			title: "In progress medium",
			priority: "medium",
			rawContent: "## Description\nMedium priority",
		};

		await filesystem.saveState(baseState);
		await filesystem.saveState(secondState);
		await filesystem.saveState(thirdState);

		await search.ensureInitialized();

		const statusFiltered = search
			.search({
				types: ["state"],
				filters: { status: "In Progress" },
			})
			.filter(isStateResult);
		expect(statusFiltered.map((result) => result.state.id)).toStrictEqual(["STATE-1", "STATE-3"]);

		const priorityFiltered = search
			.search({
				types: ["state"],
				filters: { priority: "high" },
			})
			.filter(isStateResult);
		expect(priorityFiltered).toHaveLength(1);
		expect(priorityFiltered[0]?.state.id).toBe("STATE-1");

		const combinedFiltered = search
			.search({
				types: ["state"],
				filters: { status: ["In Progress"], priority: ["medium"] },
			})
			.filter(isStateResult);
		expect(combinedFiltered.map((result) => result.state.id)).toStrictEqual(["STATE-3"]);
	});

	it("filters states by labels (requiring all selected labels)", async () => {
		const uiState: State = {
			...baseState,
			id: "state-2",
			title: "UI polish",
			status: "To Do",
			labels: ["ui", "frontend"],
			rawContent: "## Description\nUI work",
		};

		const docsState: State = {
			...baseState,
			id: "state-3",
			title: "Docs update",
			status: "Done",
			labels: ["docs"],
			rawContent: "## Description\nDocs",
		};

		await filesystem.saveState(baseState);
		await filesystem.saveState(uiState);
		await filesystem.saveState(docsState);

		await search.ensureInitialized();

		const uiFiltered = search
			.search({
				types: ["state"],
				filters: { labels: ["ui"] },
			})
			.filter(isStateResult);
		expect(uiFiltered.map((result) => result.state.id)).toStrictEqual(["STATE-2"]);

		const anyFiltered = search
			.search({
				types: ["state"],
				filters: { labels: ["ui", "frontend"] },
			})
			.filter(isStateResult);
		expect(anyFiltered.map((result) => result.state.id)).toStrictEqual(["STATE-2"]);
	});

	it("refreshes the index when content changes", async () => {
		await filesystem.saveState(baseState);
		await search.ensureInitialized();

		const initialResults = search.search({ query: "Fuse", types: ["state"] }).filter(isStateResult);
		expect(initialResults).toHaveLength(1);

		await filesystem.saveState({
			...baseState,
			rawContent: "## Description\nReindexed to new term",
			title: "Centralized service updated",
		});

		await waitForSearch(
			async () => search.search({ query: "Reindexed", types: ["state"] }).filter(isStateResult),
			(results) => {
				return results.length === 1 && results[0]?.state.title === "Centralized service updated";
			},
		);

		const staleResults = search.search({ query: "Fuse", types: ["state"] }).filter(isStateResult);
		expect(staleResults).toHaveLength(0);
	});
});

function isStateResult(result: SearchResult): result is StateSearchResult {
	return result.type === "state";
}

function isDocumentResult(result: SearchResult): result is DocumentSearchResult {
	return result.type === "document";
}

function isDecisionResult(result: SearchResult): result is DecisionSearchResult {
	return result.type === "decision";
}

async function waitForSearch<T>(
	operation: () => Promise<T> | T,
	predicate: (value: T) => boolean,
	timeout = getPlatformTimeout(),
	interval = 50,
): Promise<T> {
	const deadline = Date.now() + timeout;
	let lastValue: T;
	while (Date.now() < deadline) {
		lastValue = await operation();
		if (predicate(lastValue)) {
			return lastValue;
		}
		await sleep(interval);
	}

	lastValue = await operation();
	if (predicate(lastValue)) {
		return lastValue;
	}

	throw new Error("Timed out waiting for search results to satisfy predicate");
}
