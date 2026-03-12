import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { $ } from "bun";
import { Core } from "../core/roadmap.ts";
import type { Decision, Document, State } from "../types";
import { createUniqueTestDir, safeCleanup } from "./test-utils.ts";

const CLI_PATH = join(process.cwd(), "src", "cli.ts");

let TEST_DIR: string;

describe("CLI ID Incrementing Behavior", () => {
	let core: Core;

	beforeEach(async () => {
		TEST_DIR = createUniqueTestDir("test-cli-incrementing-ids");
		await rm(TEST_DIR, { recursive: true, force: true }).catch(() => {});
		await mkdir(TEST_DIR, { recursive: true });
		core = new Core(TEST_DIR);
		// Initialize git repository first to avoid interactive prompts and ensure consistency
		await $`git init -b main`.cwd(TEST_DIR).quiet();
		await $`git config user.name "Test User"`.cwd(TEST_DIR).quiet();
		await $`git config user.email test@example.com`.cwd(TEST_DIR).quiet();

		await core.initializeProject("ID Incrementing Test");
	});

	afterEach(async () => {
		try {
			await safeCleanup(TEST_DIR);
		} catch {
			// Ignore cleanup errors - the unique directory names prevent conflicts
		}
	});

	test("should increment state IDs correctly", async () => {
		const state1: State = {
			id: "state-1",
			title: "First State",
			status: "To Do",
			assignee: [],
			createdDate: "2025-01-01",
			labels: [],
			dependencies: [],
			description: "A test state.",
		};
		await core.createState(state1);

		const result = await $`bun ${CLI_PATH} state create "Second State"`.cwd(TEST_DIR).quiet();

		expect(result.exitCode).toBe(0);
		expect(result.stdout.toString()).toContain("Created state STATE-2");

		const state2 = await core.filesystem.loadState("state-2");
		expect(state2).toBeDefined();
		expect(state2?.title).toBe("Second State");
	});

	test("should increment document IDs correctly", async () => {
		const doc1: Document = {
			id: "doc-1",
			title: "First Doc",
			type: "other",
			createdDate: "",
			rawContent: "",
		};
		await core.createDocument(doc1);

		const result = await $`bun ${CLI_PATH} doc create "Second Doc"`.cwd(TEST_DIR).quiet();

		expect(result.exitCode).toBe(0);
		expect(result.stdout.toString()).toContain("Created document doc-2");

		const docs = await core.filesystem.listDocuments();
		const doc2 = docs.find((d) => d.id === "doc-2");
		expect(doc2).toBeDefined();
		expect(doc2?.title).toBe("Second Doc");
	});

	test("should increment decision IDs correctly", async () => {
		const decision1: Decision = {
			id: "decision-1",
			title: "First Decision",
			date: "",
			status: "proposed",
			context: "",
			decision: "",
			consequences: "",
			rawContent: "",
		};
		await core.createDecision(decision1);

		const result = await $`bun ${CLI_PATH} decision create "Second Decision"`.cwd(TEST_DIR).quiet();

		expect(result.exitCode).toBe(0);
		expect(result.stdout.toString()).toContain("Created decision decision-2");

		const decision2 = await core.filesystem.loadDecision("decision-2");
		expect(decision2).not.toBeNull();
		expect(decision2?.title).toBe("Second Decision");
	});
});
