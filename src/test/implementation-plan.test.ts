import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { $ } from "bun";
import { Core } from "../core/roadmap.ts";
import { createStatePlatformAware, editStatePlatformAware } from "./test-helpers.ts";
import { createUniqueTestDir, safeCleanup } from "./test-utils.ts";

let TEST_DIR: string;
const CLI_PATH = join(process.cwd(), "src", "cli.ts");

describe("Implementation Plan CLI", () => {
	beforeEach(async () => {
		TEST_DIR = createUniqueTestDir("test-plan");
		await mkdir(TEST_DIR, { recursive: true });
		await $`git init -b main`.cwd(TEST_DIR).quiet();
		await $`git config user.name "Test User"`.cwd(TEST_DIR).quiet();
		await $`git config user.email test@example.com`.cwd(TEST_DIR).quiet();

		const core = new Core(TEST_DIR);
		await core.initializeProject("Implementation Plan Test Project");
	});

	afterEach(async () => {
		try {
			await safeCleanup(TEST_DIR);
		} catch {
			// Ignore cleanup errors
		}
	});

	describe("state create with implementation plan", () => {
		it("should handle all state creation scenarios with implementation plans", async () => {
			// Test 1: create state with implementation plan using --plan
			const result1 =
				await $`bun ${[CLI_PATH, "state", "create", "Test State 1", "--plan", "Step 1: Analyze\nStep 2: Implement"]}`
					.cwd(TEST_DIR)
					.quiet()
					.nothrow();
			expect(result1.exitCode).toBe(0);

			const core = new Core(TEST_DIR);
			let state = await core.filesystem.loadState("state-1");
			expect(state).not.toBeNull();
			expect(state?.rawContent).toContain("## Implementation Plan");
			expect(state?.rawContent).toContain("Step 1: Analyze");
			expect(state?.rawContent).toContain("Step 2: Implement");

			// Test 2: create state with both description and implementation plan
			const result2 =
				await $`bun ${[CLI_PATH, "state", "create", "Test State 2", "-d", "State description", "--plan", "1. First step\n2. Second step"]}`
					.cwd(TEST_DIR)
					.quiet()
					.nothrow();
			expect(result2.exitCode).toBe(0);

			state = await core.filesystem.loadState("state-2");
			expect(state).not.toBeNull();
			expect(state?.rawContent).toContain("## Description");
			expect(state?.rawContent).toContain("State description");
			expect(state?.rawContent).toContain("## Implementation Plan");
			expect(state?.rawContent).toContain("1. First step");
			expect(state?.rawContent).toContain("2. Second step");

			// Test 3: create state with acceptance criteria and implementation plan
			const result = await createStatePlatformAware(
				{
					title: "Test State 3",
					ac: "Must work correctly, Must be tested",
					plan: "Phase 1: Setup\nPhase 2: Testing",
				},
				TEST_DIR,
			);

			if (result.exitCode !== 0) {
				console.error("CLI Error:", result.stderr || result.stdout);
				console.error("Exit code:", result.exitCode);
			}
			expect(result.exitCode).toBe(0);

			state = await core.filesystem.loadState(result.stateId || "state-3");
			expect(state).not.toBeNull();
			expect(state?.rawContent).toContain("## Acceptance Criteria");
			expect(state?.rawContent).toContain("- [ ] #1 Must work correctly, Must be tested");
			expect(state?.rawContent).toContain("## Implementation Plan");
			expect(state?.rawContent).toContain("Phase 1: Setup");
			expect(state?.rawContent).toContain("Phase 2: Testing");
		});
	});

	describe("state edit with implementation plan", () => {
		beforeEach(async () => {
			const core = new Core(TEST_DIR);
			await core.createState(
				{
					id: "state-1",
					title: "Existing State",
					status: "To Do",
					assignee: [],
					createdDate: "2025-06-19",
					labels: [],
					dependencies: [],
					rawContent: "## Description\n\nExisting state description",
				},
				false,
			);
		});

		it("should handle all state editing scenarios with implementation plans", async () => {
			// Test 1: add implementation plan to existing state
			const result1 = await editStatePlatformAware({ stateId: "1", plan: "New plan:\n- Step A\n- Step B" }, TEST_DIR);
			expect(result1.exitCode).toBe(0);

			const core = new Core(TEST_DIR);
			let state = await core.filesystem.loadState("state-1");
			expect(state).not.toBeNull();
			expect(state?.rawContent).toContain("## Description");
			expect(state?.rawContent).toContain("Existing state description");
			expect(state?.rawContent).toContain("## Implementation Plan");
			expect(state?.rawContent).toContain("New plan:");
			expect(state?.rawContent).toContain("- Step A");
			expect(state?.rawContent).toContain("- Step B");

			// Test 2: replace existing implementation plan
			// First add an old plan via structured field (serializer will compose)
			await core.updateStateFromInput(
				"state-1",
				{ implementationPlan: "Old plan:\n1. Old step 1\n2. Old step 2" },
				false,
			);

			// Now update with new plan
			const result2 = await editStatePlatformAware(
				{ stateId: "1", plan: "Updated plan:\n1. New step 1\n2. New step 2" },
				TEST_DIR,
			);
			expect(result2.exitCode).toBe(0);

			state = await core.filesystem.loadState("state-1");
			expect(state).not.toBeNull();
			expect(state?.rawContent).toContain("## Implementation Plan");
			expect(state?.rawContent).toContain("Updated plan:");
			expect(state?.rawContent).toContain("1. New step 1");
			expect(state?.rawContent).toContain("2. New step 2");
			expect(state?.rawContent).not.toContain("Old plan:");
			expect(state?.rawContent).not.toContain("Old step 1");

			// Test 3: update both title and implementation plan
			const result =
				await $`bun ${[CLI_PATH, "state", "edit", "1", "--title", "Updated Title", "--plan", "Implementation:\n- Do this\n- Then that"]}`
					.cwd(TEST_DIR)
					.quiet()
					.nothrow();

			if (result.exitCode !== 0) {
				console.error("CLI Error:", result.stderr.toString() || result.stdout.toString());
				console.error("Exit code:", result.exitCode);
			}
			expect(result.exitCode).toBe(0);

			state = await core.filesystem.loadState("state-1");
			expect(state).not.toBeNull();
			expect(state?.title).toBe("Updated Title");
			expect(state?.rawContent).toContain("## Implementation Plan");
			expect(state?.rawContent).toContain("Implementation:");
			expect(state?.rawContent).toContain("- Do this");
			expect(state?.rawContent).toContain("- Then that");
		});
	});

	describe("implementation plan positioning", () => {
		it("should handle implementation plan positioning and edge cases", async () => {
			// Test 1: place implementation plan after acceptance criteria when both exist
			const result1 =
				await $`bun ${[CLI_PATH, "state", "create", "Test State", "-d", "Description text", "--ac", "Criterion 1", "--plan", "Plan text"]}`
					.cwd(TEST_DIR)
					.quiet()
					.nothrow();

			if (result1.exitCode !== 0) {
				console.error("CLI Error:", result1.stderr.toString() || result1.stdout.toString());
				console.error("Exit code:", result1.exitCode);
			}
			expect(result1.exitCode).toBe(0);

			const core = new Core(TEST_DIR);
			let state = await core.filesystem.loadState("state-1");
			expect(state).not.toBeNull();

			const description = state?.rawContent || "";
			const descIndex = description.indexOf("## Description");
			const acIndex = description.indexOf("## Acceptance Criteria");
			const planIndex = description.indexOf("## Implementation Plan");

			// Verify order: Description -> Acceptance Criteria -> Implementation Plan
			expect(descIndex).toBeLessThan(acIndex);
			expect(acIndex).toBeLessThan(planIndex);

			// Test 2: create state without plan (should not add the section)
			const result2 = await $`bun ${[CLI_PATH, "state", "create", "Test State 2"]}`.cwd(TEST_DIR).quiet().nothrow();

			if (result2.exitCode !== 0) {
				console.error("CLI Error:", result2.stderr.toString() || result2.stdout.toString());
				console.error("Exit code:", result2.exitCode);
			}
			expect(result2.exitCode).toBe(0);

			state = await core.filesystem.loadState("state-2");
			expect(state).not.toBeNull();
			// Should NOT add the section when no plan is provided
			expect(state?.rawContent).not.toContain("## Implementation Plan");
		});
	});
});
