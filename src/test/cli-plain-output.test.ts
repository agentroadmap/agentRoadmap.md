import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { $ } from "bun";
import { Core } from "../index.ts";
import { createUniqueTestDir, safeCleanup } from "./test-utils.ts";

let TEST_DIR: string;
let SUBSTATES: Array<{ id: string; title: string }> = [];

describe("CLI plain output for AI agents", () => {
	const cliPath = join(process.cwd(), "src", "cli.ts");

	beforeEach(async () => {
		TEST_DIR = createUniqueTestDir("test-plain-output");
		try {
			await rm(TEST_DIR, { recursive: true, force: true });
		} catch {
			// Ignore cleanup errors
		}
		await mkdir(TEST_DIR, { recursive: true });

		// Initialize git repo first using shell API (same pattern as other tests)
		await $`git init -b main`.cwd(TEST_DIR).quiet();
		await $`git config user.name "Test User"`.cwd(TEST_DIR).quiet();
		await $`git config user.email test@example.com`.cwd(TEST_DIR).quiet();

		// Initialize roadmap project using Core (same pattern as other tests)
		const core = new Core(TEST_DIR);
		await core.initializeProject("Plain Output Test Project");

		// Create a test state
		await core.createState(
			{
				id: "state-1",
				title: "Test state for plain output",
				status: "To Do",
				assignee: [],
				createdDate: "2025-06-18",
				labels: [],
				dependencies: [],
				description: "Test description",
			},
			false,
		);

		const { state: substate1 } = await core.createStateFromInput(
			{
				title: "Child state A",
				parentStateId: "state-1",
			},
			false,
		);

		const { state: substate2 } = await core.createStateFromInput(
			{
				title: "Child state B",
				parentStateId: "state-1",
			},
			false,
		);

		// Preserve order for assertions
		SUBSTATES = [substate1, substate2];

		// Create a second state without substates
		await core.createState(
			{
				id: "state-2",
				title: "Standalone state for plain output",
				status: "To Do",
				assignee: [],
				createdDate: "2025-06-19",
				labels: [],
				dependencies: [],
				description: "Standalone description",
			},
			false,
		);

		// Create a test draft with proper DRAFT-X id format
		await core.createDraft(
			{
				id: "draft-1",
				title: "Test draft for plain output",
				status: "Draft",
				assignee: [],
				createdDate: "2025-06-18",
				labels: [],
				dependencies: [],
				description: "Test draft description",
			},
			false,
		);
	});

	afterEach(async () => {
		try {
			await safeCleanup(TEST_DIR);
		} catch {
			// Ignore cleanup errors - the unique directory names prevent conflicts
		}
	});

	it("should output plain text with state view --plain", async () => {
		const result = await $`bun ${cliPath} state view 1 --plain`.cwd(TEST_DIR).quiet();

		if (result.exitCode !== 0) {
			console.error("STDOUT:", result.stdout.toString());
			console.error("STDERR:", result.stderr.toString());
		}

		expect(result.exitCode).toBe(0);
		// Should contain the file path as first line
		expect(result.stdout.toString()).toContain("File: ");
		expect(result.stdout.toString()).toContain("state-1 - Test-state-for-plain-output.md");
		// Should contain the formatted state output
		expect(result.stdout.toString()).toContain("State STATE-1 - Test state for plain output");
		expect(result.stdout.toString()).toContain("Status: ○ To Do");
		expect(result.stdout.toString()).toContain("Created: 2025-06-18");
		expect(result.stdout.toString()).toContain("Substates (2):");
		const [substate1, substate2] = SUBSTATES;
		if (substate1 && substate2) {
			const output = result.stdout.toString();
			expect(output).toContain(`- ${substate1.id} - ${substate1.title}`);
			expect(output).toContain(`- ${substate2.id} - ${substate2.title}`);
			expect(output.indexOf(substate1.id)).toBeLessThan(output.indexOf(substate2.id));
		}
		expect(result.stdout.toString()).toContain("Description:");
		expect(result.stdout.toString()).toContain("Test description");
		expect(result.stdout.toString()).toContain("Acceptance Criteria:");
		expect(result.stdout.toString()).toContain("Definition of Done:");
		// Should not contain TUI escape codes
		expect(result.stdout.toString()).not.toContain("[?1049h");
		expect(result.stdout.toString()).not.toContain("\x1b");
	});

	it("should output plain text with state <id> --plain shortcut", async () => {
		// Verify state exists before running CLI command
		const core = new Core(TEST_DIR);
		const state = await core.filesystem.loadState("state-1");
		expect(state).not.toBeNull();
		expect(state?.id).toBe("STATE-1");

		const result = await $`bun ${cliPath} state 1 --plain`.cwd(TEST_DIR).quiet();

		if (result.exitCode !== 0) {
			console.error("STDOUT:", result.stdout.toString());
			console.error("STDERR:", result.stderr.toString());
		}

		expect(result.exitCode).toBe(0);
		// Should contain the file path as first line
		expect(result.stdout.toString()).toContain("File: ");
		expect(result.stdout.toString()).toContain("state-1 - Test-state-for-plain-output.md");
		// Should contain the formatted state output
		expect(result.stdout.toString()).toContain("State STATE-1 - Test state for plain output");
		expect(result.stdout.toString()).toContain("Status: ○ To Do");
		expect(result.stdout.toString()).toContain("Created: 2025-06-18");
		expect(result.stdout.toString()).toContain("Description:");
		expect(result.stdout.toString()).toContain("Test description");
		expect(result.stdout.toString()).toContain("Definition of Done:");
		// Should not contain TUI escape codes
		expect(result.stdout.toString()).not.toContain("[?1049h");
		expect(result.stdout.toString()).not.toContain("\x1b");
	});

	it("should not include a substate list when none exist", async () => {
		const result = await $`bun ${cliPath} state view 2 --plain`.cwd(TEST_DIR).quiet();

		if (result.exitCode !== 0) {
			console.error("STDOUT:", result.stdout.toString());
			console.error("STDERR:", result.stderr.toString());
		}

		expect(result.exitCode).toBe(0);
		expect(result.stdout.toString()).toContain("State STATE-2 - Standalone state for plain output");
		expect(result.stdout.toString()).not.toContain("Substates (");
		expect(result.stdout.toString()).not.toContain("Substates:");
	});

	it("should output plain text with draft view --plain", async () => {
		const result = await $`bun ${cliPath} draft view 1 --plain`.cwd(TEST_DIR).quiet();

		if (result.exitCode !== 0) {
			console.error("STDOUT:", result.stdout.toString());
			console.error("STDERR:", result.stderr.toString());
		}

		expect(result.exitCode).toBe(0);
		// Should contain the file path as first line
		expect(result.stdout.toString()).toContain("File: ");
		expect(result.stdout.toString()).toContain("draft-1 - Test-draft-for-plain-output.md");
		// Should contain the formatted draft output
		expect(result.stdout.toString()).toContain("State DRAFT-1 - Test draft for plain output");
		expect(result.stdout.toString()).toContain("Status: ○ Draft");
		expect(result.stdout.toString()).toContain("Created: 2025-06-18");
		expect(result.stdout.toString()).toContain("Description:");
		expect(result.stdout.toString()).toContain("Test draft description");
		expect(result.stdout.toString()).toContain("Definition of Done:");
		// Should not contain TUI escape codes
		expect(result.stdout.toString()).not.toContain("[?1049h");
		expect(result.stdout.toString()).not.toContain("\x1b");
	});

	it("should output plain text with draft <id> --plain shortcut", async () => {
		// Verify draft exists before running CLI command
		const core = new Core(TEST_DIR);
		const draft = await core.filesystem.loadDraft("draft-1");
		expect(draft).not.toBeNull();
		expect(draft?.id).toBe("DRAFT-1");

		const result = await $`bun ${cliPath} draft 1 --plain`.cwd(TEST_DIR).quiet();

		if (result.exitCode !== 0) {
			console.error("STDOUT:", result.stdout.toString());
			console.error("STDERR:", result.stderr.toString());
		}

		expect(result.exitCode).toBe(0);
		// Should contain the file path as first line
		expect(result.stdout.toString()).toContain("File: ");
		expect(result.stdout.toString()).toContain("draft-1 - Test-draft-for-plain-output.md");
		// Should contain the formatted draft output
		expect(result.stdout.toString()).toContain("State DRAFT-1 - Test draft for plain output");
		expect(result.stdout.toString()).toContain("Status: ○ Draft");
		expect(result.stdout.toString()).toContain("Created: 2025-06-18");
		expect(result.stdout.toString()).toContain("Description:");
		expect(result.stdout.toString()).toContain("Test draft description");
		expect(result.stdout.toString()).toContain("Definition of Done:");
		// Should not contain TUI escape codes
		expect(result.stdout.toString()).not.toContain("[?1049h");
		expect(result.stdout.toString()).not.toContain("\x1b");
	});

	// State list already has --plain support and works correctly
});
