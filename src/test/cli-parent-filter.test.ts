import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { $ } from "bun";
import { Core } from "../index.ts";
import { createUniqueTestDir, safeCleanup } from "./test-utils.ts";

let TEST_DIR: string;

describe("CLI parent state filtering", () => {
	const cliPath = join(process.cwd(), "src", "cli.ts");

	beforeEach(async () => {
		TEST_DIR = createUniqueTestDir("test-parent-filter");
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
		await core.initializeProject("Parent Filter Test Project");

		// Create a parent state
		await core.createState(
			{
				id: "state-1",
				title: "Parent state",
				status: "To Do",
				assignee: [],
				createdDate: "2025-06-18",
				labels: [],
				dependencies: [],
				description: "Parent state description",
			},
			false,
		);

		// Create child states
		await core.createState(
			{
				id: "state-1.1",
				title: "Child state 1",
				status: "To Do",
				assignee: [],
				createdDate: "2025-06-18",
				labels: [],
				dependencies: [],
				description: "Child state 1 description",
				parentStateId: "state-1",
			},
			false,
		);

		await core.createState(
			{
				id: "state-1.2",
				title: "Child state 2",
				status: "In Progress",
				assignee: [],
				createdDate: "2025-06-18",
				labels: [],
				dependencies: [],
				description: "Child state 2 description",
				parentStateId: "state-1",
			},
			false,
		);

		// Create another standalone state
		await core.createState(
			{
				id: "state-2",
				title: "Standalone state",
				status: "To Do",
				assignee: [],
				createdDate: "2025-06-18",
				labels: [],
				dependencies: [],
				description: "Standalone state description",
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

	it("should filter states by parent with full state ID", async () => {
		const result = await $`bun ${cliPath} state list --parent state-1 --plain`.cwd(TEST_DIR).quiet();

		const exitCode = result.exitCode;

		if (exitCode !== 0) {
			console.error("STDOUT:", result.stdout.toString());
			console.error("STDERR:", result.stderr.toString());
		}

		expect(exitCode).toBe(0);
		// Should contain only child states
		expect(result.stdout.toString()).toContain("STATE-1.1 - Child state 1");
		expect(result.stdout.toString()).toContain("STATE-1.2 - Child state 2");
		// Should not contain parent or standalone states
		expect(result.stdout.toString()).not.toContain("STATE-1 - Parent state");
		expect(result.stdout.toString()).not.toContain("STATE-2 - Standalone state");
	});

	it("should filter states by parent with short state ID", async () => {
		const result = await $`bun ${cliPath} state list --parent 1 --plain`.cwd(TEST_DIR).quiet();

		const exitCode = result.exitCode;

		if (exitCode !== 0) {
			console.error("STDOUT:", result.stdout.toString());
			console.error("STDERR:", result.stderr.toString());
		}

		expect(exitCode).toBe(0);
		// Should contain only child states
		expect(result.stdout.toString()).toContain("STATE-1.1 - Child state 1");
		expect(result.stdout.toString()).toContain("STATE-1.2 - Child state 2");
		// Should not contain parent or standalone states
		expect(result.stdout.toString()).not.toContain("STATE-1 - Parent state");
		expect(result.stdout.toString()).not.toContain("STATE-2 - Standalone state");
	});

	it("should show error for non-existent parent state", async () => {
		const result = await $`bun ${cliPath} state list --parent state-999 --plain`.cwd(TEST_DIR).nothrow().quiet();

		const exitCode = result.exitCode;

		expect(exitCode).toBe(1); // CLI exits with error for non-existent parent
		expect(result.stderr.toString()).toContain("Parent state STATE-999 not found.");
	});

	it("should show message when parent has no children", async () => {
		const result = await $`bun ${cliPath} state list --parent state-2 --plain`.cwd(TEST_DIR).quiet();

		const exitCode = result.exitCode;

		if (exitCode !== 0) {
			console.error("STDOUT:", result.stdout.toString());
			console.error("STDERR:", result.stderr.toString());
		}

		expect(exitCode).toBe(0);
		expect(result.stdout.toString()).toContain("No child states found for parent state STATE-2.");
	});

	it("should work with -p shorthand flag", async () => {
		const result = await $`bun ${cliPath} state list -p state-1 --plain`.cwd(TEST_DIR).quiet();

		const exitCode = result.exitCode;

		if (exitCode !== 0) {
			console.error("STDOUT:", result.stdout.toString());
			console.error("STDERR:", result.stderr.toString());
		}

		expect(exitCode).toBe(0);
		// Should contain only child states
		expect(result.stdout.toString()).toContain("STATE-1.1 - Child state 1");
		expect(result.stdout.toString()).toContain("STATE-1.2 - Child state 2");
	});

	it("should combine parent filter with status filter", async () => {
		const result = await $`bun ${cliPath} state list --parent state-1 --status "To Do" --plain`.cwd(TEST_DIR).quiet();

		const exitCode = result.exitCode;

		if (exitCode !== 0) {
			console.error("STDOUT:", result.stdout.toString());
			console.error("STDERR:", result.stderr.toString());
		}

		expect(exitCode).toBe(0);
		// Should contain only child state with "To Do" status
		expect(result.stdout.toString()).toContain("STATE-1.1 - Child state 1");
		// Should not contain child state with "In Progress" status
		expect(result.stdout.toString()).not.toContain("STATE-1.2 - Child state 2");
	});
});
