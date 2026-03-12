import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, rm } from "node:fs/promises";
import { $ } from "bun";
import { Core } from "../core/roadmap.ts";
import { createStatePlatformAware, editStatePlatformAware, viewStatePlatformAware } from "./test-helpers.ts";
import { createUniqueTestDir, safeCleanup } from "./test-utils.ts";

describe("CLI Dependency Support", () => {
	let TEST_DIR: string;
	let core: Core;

	beforeEach(async () => {
		TEST_DIR = createUniqueTestDir("test-cli-dependency");
		try {
			await rm(TEST_DIR, { recursive: true, force: true });
		} catch {
			// Ignore cleanup errors
		}
		await mkdir(TEST_DIR, { recursive: true });

		// Initialize git repository first using the same pattern as other tests
		await $`git init -b main`.cwd(TEST_DIR).quiet();
		await $`git config user.name "Test User"`.cwd(TEST_DIR).quiet();
		await $`git config user.email test@example.com`.cwd(TEST_DIR).quiet();

		core = new Core(TEST_DIR);
		await core.initializeProject("test-project");
	});

	afterEach(async () => {
		try {
			await safeCleanup(TEST_DIR);
		} catch {
			// Ignore cleanup errors - the unique directory names prevent conflicts
		}
	});

	test("should create state with single dependency using --dep", async () => {
		// Create base state first
		const result1 = await createStatePlatformAware({ title: "Base State" }, TEST_DIR);
		expect(result1.exitCode).toBe(0);

		// Create state with dependency
		const result2 = await createStatePlatformAware({ title: "Dependent State", dependencies: "state-1" }, TEST_DIR);
		expect(result2.exitCode).toBe(0);
		expect(result2.stdout).toContain("Created state STATE-2");

		// Verify dependency was set
		const state = await core.filesystem.loadState("state-2");
		expect(state).not.toBeNull();
		expect(state?.dependencies).toEqual(["STATE-1"]);
	});

	test("should create state with single dependency using --depends-on", async () => {
		// Create base state first
		const result1 = await createStatePlatformAware({ title: "Base State" }, TEST_DIR);
		expect(result1.exitCode).toBe(0);

		// Create state with dependency
		const result2 = await createStatePlatformAware({ title: "Dependent State", dependencies: "state-1" }, TEST_DIR);
		expect(result2.exitCode).toBe(0);
		expect(result2.stdout).toContain("Created state STATE-2");

		// Verify dependency was set
		const state = await core.filesystem.loadState("state-2");
		expect(state).not.toBeNull();
		expect(state?.dependencies).toEqual(["STATE-1"]);
	});

	test("should create state with multiple dependencies (comma-separated)", async () => {
		// Create base states first
		const result1 = await createStatePlatformAware({ title: "Base State 1" }, TEST_DIR);
		expect(result1.exitCode).toBe(0);
		const result2 = await createStatePlatformAware({ title: "Base State 2" }, TEST_DIR);
		expect(result2.exitCode).toBe(0);

		// Create state with multiple dependencies
		const result3 = await createStatePlatformAware({ title: "Dependent State", dependencies: "state-1,state-2" }, TEST_DIR);
		expect(result3.exitCode).toBe(0);
		expect(result3.stdout).toContain("Created state STATE-3");

		// Verify dependencies were set
		const state = await core.filesystem.loadState("state-3");
		expect(state).not.toBeNull();
		expect(state?.dependencies).toEqual(["STATE-1", "STATE-2"]);
	});

	test("should create state with multiple dependencies (multiple flags)", async () => {
		// Create base states first
		const result1 = await createStatePlatformAware({ title: "Base State 1" }, TEST_DIR);
		expect(result1.exitCode).toBe(0);
		const result2 = await createStatePlatformAware({ title: "Base State 2" }, TEST_DIR);
		expect(result2.exitCode).toBe(0);

		// Create state with multiple dependencies using multiple flags (simulated as comma-separated)
		const result3 = await createStatePlatformAware({ title: "Dependent State", dependencies: "state-1,state-2" }, TEST_DIR);
		expect(result3.exitCode).toBe(0);
		expect(result3.stdout).toContain("Created state STATE-3");

		// Verify dependencies were set
		const state = await core.filesystem.loadState("state-3");
		expect(state).not.toBeNull();
		expect(state?.dependencies).toEqual(["STATE-1", "STATE-2"]);
	});

	test("should normalize state IDs in dependencies", async () => {
		// Create base state first
		const result1 = await createStatePlatformAware({ title: "Base State" }, TEST_DIR);
		expect(result1.exitCode).toBe(0);

		// Create state with dependency using numeric ID (should be normalized to STATE-X)
		const result2 = await createStatePlatformAware({ title: "Dependent State", dependencies: "1" }, TEST_DIR);
		expect(result2.exitCode).toBe(0);
		expect(result2.stdout).toContain("Created state STATE-2");

		// Verify dependency was normalized
		const state = await core.filesystem.loadState("state-2");
		expect(state).not.toBeNull();
		expect(state?.dependencies).toEqual(["STATE-1"]);
	});

	test("should fail when dependency state does not exist", async () => {
		// Try to create state with non-existent dependency
		const result = await createStatePlatformAware({ title: "Dependent State", dependencies: "state-999" }, TEST_DIR);
		expect(result.exitCode).toBe(1);
		expect(result.stderr).toContain("The following dependencies do not exist: STATE-999");
	});

	test("should edit state to add dependencies", async () => {
		// Create base states first
		const result1 = await createStatePlatformAware({ title: "Base State 1" }, TEST_DIR);
		expect(result1.exitCode).toBe(0);
		const result2 = await createStatePlatformAware({ title: "Base State 2" }, TEST_DIR);
		expect(result2.exitCode).toBe(0);
		const result3 = await createStatePlatformAware({ title: "State to Edit" }, TEST_DIR);
		expect(result3.exitCode).toBe(0);

		// Edit state to add dependencies
		const result4 = await editStatePlatformAware({ stateId: "state-3", dependencies: "state-1,state-2" }, TEST_DIR);
		expect(result4.exitCode).toBe(0);
		expect(result4.stdout).toContain("Updated state state-3");

		// Verify dependencies were added
		const state = await core.filesystem.loadState("state-3");
		expect(state).not.toBeNull();
		expect(state?.dependencies).toEqual(["STATE-1", "STATE-2"]);
	});

	test("should edit state to update dependencies", async () => {
		// Create base states using platform-aware helper
		const result1 = await createStatePlatformAware({ title: "Base State 1" }, TEST_DIR);
		expect(result1.exitCode).toBe(0);
		const result2 = await createStatePlatformAware({ title: "Base State 2" }, TEST_DIR);
		expect(result2.exitCode).toBe(0);
		const result3 = await createStatePlatformAware({ title: "Base State 3" }, TEST_DIR);
		expect(result3.exitCode).toBe(0);

		// Create state with initial dependency
		const result4 = await createStatePlatformAware(
			{
				title: "State with Dependency",
				dependencies: "state-1",
			},
			TEST_DIR,
		);
		expect(result4.exitCode).toBe(0);

		// Edit state to change dependencies using platform-aware helper
		const result5 = await editStatePlatformAware(
			{
				stateId: "state-4",
				dependencies: "state-2,state-3",
			},
			TEST_DIR,
		);
		expect(result5.exitCode).toBe(0);

		// Verify dependencies were updated (should replace, not append)
		const state = await core.filesystem.loadState("state-4");
		expect(state).not.toBeNull();
		expect(state?.dependencies).toEqual(["STATE-2", "STATE-3"]);
	});

	test("should handle dependencies on draft states", async () => {
		// Create draft state first using platform-aware helper
		// Drafts now get DRAFT-X ids
		const result1 = await createStatePlatformAware(
			{
				title: "Draft State",
				draft: true,
			},
			TEST_DIR,
		);
		expect(result1.exitCode).toBe(0);
		expect(result1.stdout).toContain("Created draft DRAFT-1");

		// Create state that depends on draft
		// Note: States and drafts have separate ID sequences now
		const result2 = await createStatePlatformAware(
			{
				title: "State depending on draft",
				dependencies: "DRAFT-1",
			},
			TEST_DIR,
		);
		expect(result2.exitCode).toBe(0);

		// Verify dependency on draft was set
		// First non-draft state will be STATE-1
		const state = await core.filesystem.loadState("state-1");
		expect(state).not.toBeNull();
		expect(state?.dependencies).toEqual(["DRAFT-1"]);
	});

	test("should display dependencies in plain text view", async () => {
		// Create base state
		const result1 = await createStatePlatformAware({ title: "Base State" }, TEST_DIR);
		expect(result1.exitCode).toBe(0);

		// Create state with dependency
		const result2 = await createStatePlatformAware({ title: "Dependent State", dependencies: "state-1" }, TEST_DIR);
		expect(result2.exitCode).toBe(0);

		// View state in plain text mode
		const result3 = await viewStatePlatformAware({ stateId: "state-2", plain: true }, TEST_DIR);
		expect(result3.exitCode).toBe(0);
		expect(result3.stdout).toContain("Dependencies: STATE-1");
	});
});
