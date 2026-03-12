import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { unlink } from "node:fs/promises";
import { join } from "node:path";
import { ContentStore, type ContentStoreEvent } from "../core/content-store.ts";
import { FileSystem } from "../file-system/operations.ts";
import type { Decision, Document, State } from "../types/index.ts";
import { createUniqueTestDir, getPlatformTimeout, safeCleanup, sleep } from "./test-utils.ts";

let TEST_DIR: string;

describe("ContentStore", () => {
	let filesystem: FileSystem;
	let store: ContentStore;

	const sampleState: State = {
		id: "state-1",
		title: "Sample State",
		status: "To Do",
		assignee: [],
		createdDate: "2025-09-19 10:00",
		labels: [],
		dependencies: [],
		rawContent: "## Description\nSeed content",
	};

	const sampleDecision: Decision = {
		id: "decision-1",
		title: "Adopt shared cache",
		date: "2025-09-19",
		status: "proposed",
		context: "Context",
		decision: "Decision text",
		consequences: "Consequences",
		rawContent: "## Context\nContext\n\n## Decision\nDecision text\n\n## Consequences\nConsequences",
	};

	const sampleDocument: Document = {
		id: "doc-1",
		title: "Architecture Guide",
		type: "guide",
		createdDate: "2025-09-19",
		rawContent: "# Architecture Guide",
	};

	beforeEach(async () => {
		TEST_DIR = createUniqueTestDir("test-content-store");
		filesystem = new FileSystem(TEST_DIR);
		await filesystem.ensureRoadmapStructure();
		store = new ContentStore(filesystem);
	});

	afterEach(async () => {
		store?.dispose();
		try {
			await safeCleanup(TEST_DIR);
		} catch {
			// Ignore cleanup errors
		}
	});

	it("loads states, documents, and decisions during initialization", async () => {
		await filesystem.saveState(sampleState);
		await filesystem.saveDecision(sampleDecision);
		await filesystem.saveDocument(sampleDocument);

		const snapshot = await store.ensureInitialized();

		expect(snapshot.states).toHaveLength(1);
		expect(snapshot.documents).toHaveLength(1);
		expect(snapshot.decisions).toHaveLength(1);
		expect(snapshot.states.map((state) => state.id)).toContain("STATE-1");
	});

	it("emits state updates when underlying files change", async () => {
		await filesystem.saveState(sampleState);
		await store.ensureInitialized();

		const waitForUpdate = waitForEventWithTimeout(store, (event) => {
			return event.type === "states" && event.states.some((state) => state.title === "Updated State");
		});

		await filesystem.saveState({ ...sampleState, title: "Updated State" });
		await waitForUpdate;

		const states = store.getStates();
		expect(states.map((state) => state.title)).toContain("Updated State");
	});

	it("updates documents when new files are added", async () => {
		await store.ensureInitialized();

		const waitForDocument = waitForEventWithTimeout(store, (event) => {
			return event.type === "documents" && event.documents.some((doc) => doc.id === "doc-2");
		});

		await filesystem.saveDocument(
			{
				...sampleDocument,
				id: "doc-2",
				title: "Implementation Notes",
				rawContent: "# Implementation Notes",
			},
			"guides",
		);

		await waitForDocument;

		const documents = store.getDocuments();
		expect(documents.some((doc) => doc.id === "doc-2")).toBe(true);
	});

	it("preserves cross-branch states from the state loader during refresh", async () => {
		await filesystem.saveState(sampleState);

		const remoteState: State = {
			id: "state-remote",
			title: "Remote State",
			status: "In Progress",
			assignee: ["alice"],
			createdDate: "2025-10-01 12:00",
			labels: ["remote"],
			dependencies: [],
			rawContent: "## Description\nRemote content",
			source: "remote",
		};

		let loaderCalls = 0;
		store.dispose();
		store = new ContentStore(filesystem, async () => {
			loaderCalls += 1;
			const localStates = await filesystem.listStates();
			return [...localStates, remoteState];
		});

		await store.ensureInitialized();
		expect(store.getStates().map((state) => state.id)).toContain("state-remote");

		await (store as unknown as { refreshStatesFromDisk: () => Promise<void> }).refreshStatesFromDisk();

		const refreshedStates = store.getStates();
		expect(refreshedStates.map((state) => state.id)).toContain("state-remote");
		expect(loaderCalls).toBeGreaterThanOrEqual(2);
	});

	it("removes decisions when files are deleted", async () => {
		store.dispose();
		store = new ContentStore(filesystem, undefined, true);
		await filesystem.saveDecision(sampleDecision);
		await store.ensureInitialized();

		const decisionsDir = filesystem.decisionsDir;
		const decisionFiles: string[] = [];
		for await (const file of new Bun.Glob("decision-*.md").scan({ cwd: decisionsDir, followSymlinks: true })) {
			decisionFiles.push(file);
		}
		const decisionFile = decisionFiles.find((file) => file.startsWith("decision-1"));
		if (!decisionFile) {
			throw new Error("Expected decision file was not created");
		}

		const waitForRemoval = waitForEventWithTimeout(store, (event) => {
			return event.type === "decisions" && event.decisions.every((decision) => decision.id !== "decision-1");
		});

		await unlink(join(decisionsDir, decisionFile));
		await waitForRemoval;

		const decisions = store.getDecisions();
		expect(decisions.find((decision) => decision.id === "decision-1")).toBeUndefined();
	});
});

function waitForEventWithTimeout(
	store: ContentStore,
	predicate: (event: ContentStoreEvent) => boolean,
	timeout = getPlatformTimeout(),
): Promise<ContentStoreEvent> {
	const eventPromise = new Promise<ContentStoreEvent>((resolve) => {
		const unsubscribe = store.subscribe((event) => {
			if (!predicate(event)) {
				return;
			}
			unsubscribe();
			resolve(event);
		});
	});

	return Promise.race([
		eventPromise,
		sleep(timeout).then(() => {
			throw new Error("Timed out waiting for content store event");
		}),
	]);
}
