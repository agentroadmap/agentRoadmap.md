import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { $ } from "bun";
import { Core } from "../core/roadmap.ts";
import { extractStructuredSection } from "../markdown/structured-sections.ts";
import type { State } from "../types/index.ts";
import { editStatePlatformAware } from "./test-helpers.ts";
import { createUniqueTestDir, safeCleanup } from "./test-utils.ts";

let TEST_DIR: string;
const CLI_PATH = join(process.cwd(), "src", "cli.ts");

describe("Implementation Notes CLI", () => {
	beforeEach(async () => {
		TEST_DIR = createUniqueTestDir("test-notes");
		await mkdir(TEST_DIR, { recursive: true });
		await $`git init -b main`.cwd(TEST_DIR).quiet();
		await $`git config user.name "Test User"`.cwd(TEST_DIR).quiet();
		await $`git config user.email test@example.com`.cwd(TEST_DIR).quiet();

		const core = new Core(TEST_DIR);
		await core.initializeProject("Implementation Notes Test Project");
	});

	afterEach(async () => {
		try {
			await safeCleanup(TEST_DIR);
		} catch {
			// Ignore cleanup errors
		}
	});

	describe("state create with implementation notes", () => {
		it("should handle all state creation scenarios with implementation notes", async () => {
			// Test 1: create state with implementation notes using --notes
			const result1 =
				await $`bun ${[CLI_PATH, "state", "create", "Test State 1", "--notes", "Initial implementation completed"]}`
					.cwd(TEST_DIR)
					.quiet()
					.nothrow();
			expect(result1.exitCode).toBe(0);

			const core = new Core(TEST_DIR);
			let state = await core.filesystem.loadState("state-1");
			expect(state).not.toBeNull();
			expect(state?.rawContent).toContain("<!-- SECTION:NOTES:BEGIN -->");
			expect(extractStructuredSection(state?.rawContent || "", "implementationNotes")).toContain(
				"Initial implementation completed",
			);

			// Test 2: create state with multi-line implementation notes
			const result2 =
				await $`bun ${[CLI_PATH, "state", "create", "Test State 2", "--notes", "Step 1: Analysis completed\nStep 2: Implementation in progress"]}`
					.cwd(TEST_DIR)
					.quiet()
					.nothrow();
			expect(result2.exitCode).toBe(0);

			state = await core.filesystem.loadState("state-2");
			expect(state).not.toBeNull();
			const notes2 = extractStructuredSection(state?.rawContent || "", "implementationNotes") || "";
			expect(notes2).toContain("Step 1: Analysis completed");
			expect(notes2).toContain("Step 2: Implementation in progress");

			// Test 3: create state with both plan and notes (notes should come after plan)
			const result3 =
				await $`bun ${[CLI_PATH, "state", "create", "Test State 3", "--plan", "1. Design\n2. Build\n3. Test", "--notes", "Following the plan step by step"]}`
					.cwd(TEST_DIR)
					.quiet()
					.nothrow();
			expect(result3.exitCode).toBe(0);

			state = await core.filesystem.loadState("state-3");
			expect(state).not.toBeNull();
			expect(extractStructuredSection(state?.rawContent || "", "implementationPlan")).toContain("1. Design");
			expect(extractStructuredSection(state?.rawContent || "", "implementationNotes")).toContain(
				"Following the plan step by step",
			);

			// Check that Implementation Notes comes after Implementation Plan
			const desc = state?.rawContent || "";
			const planIndex = desc.indexOf("## Implementation Plan");
			const notesIndex = desc.indexOf("## Implementation Notes");
			expect(notesIndex).toBeGreaterThan(planIndex);

			// Test 4: create state with multiple options including notes
			const result4 =
				await $`bun ${[CLI_PATH, "state", "create", "Test State 4", "-d", "Complex state description", "--ac", "Must work correctly,Must be tested", "--notes", "Using TDD approach"]}`
					.cwd(TEST_DIR)
					.quiet()
					.nothrow();
			expect(result4.exitCode).toBe(0);

			state = await core.filesystem.loadState("state-4");
			expect(state).not.toBeNull();
			expect(state?.rawContent).toContain("Complex state description");
			expect(extractStructuredSection(state?.rawContent || "", "implementationNotes")).toContain("Using TDD approach");

			// Test 5: create state without notes should not add the section
			const result5 = await $`bun ${[CLI_PATH, "state", "create", "Test State 5"]}`.cwd(TEST_DIR).quiet().nothrow();
			expect(result5.exitCode).toBe(0);

			state = await core.filesystem.loadState("state-5");
			expect(state).not.toBeNull();
			// Should not add Implementation Notes section for empty notes
			expect(state?.rawContent).not.toContain("## Implementation Notes");
		});
	});

	describe("state edit with implementation notes", () => {
		it("should handle all implementation notes scenarios", async () => {
			const core = new Core(TEST_DIR);

			// Test 1: add implementation notes to existing state
			const state1: State = {
				id: "state-1",
				title: "Test State 1",
				status: "To Do",
				assignee: [],
				createdDate: "2025-07-03",
				labels: [],
				dependencies: [],
				description: "Test description",
			};
			await core.createState(state1, false);

			let result = await editStatePlatformAware(
				{
					stateId: "1",
					notes: "Fixed the bug by updating the validation logic",
				},
				TEST_DIR,
			);
			expect(result.exitCode).toBe(0);

			let updatedState = await core.filesystem.loadState("state-1");
			expect(updatedState).not.toBeNull();
			expect(updatedState?.rawContent).toContain("## Implementation Notes");
			expect(updatedState?.rawContent).toContain("Fixed the bug by updating the validation logic");

			// Test 2: overwrite existing implementation notes
			const state2: State = {
				id: "state-2",
				title: "Test State 2",
				status: "To Do",
				assignee: [],
				createdDate: "2025-07-03",
				labels: [],
				dependencies: [],
				description: "Test description",
				implementationNotes: "Initial implementation completed",
			};
			await core.createState(state2, false);

			result = await editStatePlatformAware(
				{
					stateId: "2",
					notes: "Added error handling",
				},
				TEST_DIR,
			);
			expect(result.exitCode).toBe(0);

			updatedState = await core.filesystem.loadState("state-2");
			expect(updatedState).not.toBeNull();
			const notesSection = updatedState?.rawContent?.match(/## Implementation Notes\s*\n([\s\S]*?)(?=\n## |$)/i);
			expect(notesSection?.[1]).not.toContain("Initial implementation completed");
			expect(notesSection?.[1]).toContain("Added error handling");

			// Test 3: work together with status update when marking as Done
			const state3: State = {
				id: "state-3",
				title: "Feature Implementation",
				status: "In Progress",
				assignee: ["@dev"],
				createdDate: "2025-07-03",
				labels: ["feature"],
				dependencies: [],
				description: "Implement new feature",
				acceptanceCriteriaItems: [
					{ index: 1, text: "Feature works", checked: false },
					{ index: 2, text: "Tests pass", checked: false },
				],
			};
			await core.createState(state3, false);

			result = await editStatePlatformAware(
				{
					stateId: "3",
					status: "Done",
					notes: "Implemented using the factory pattern\nAdded unit tests\nUpdated documentation",
				},
				TEST_DIR,
			);
			expect(result.exitCode).toBe(0);

			updatedState = await core.filesystem.loadState("state-3");
			expect(updatedState).not.toBeNull();
			expect(updatedState?.status).toBe("Done");
			expect(updatedState?.rawContent).toContain("## Implementation Notes");
			expect(updatedState?.rawContent).toContain("Implemented using the factory pattern");
			expect(updatedState?.rawContent).toContain("Added unit tests");
			expect(updatedState?.rawContent).toContain("Updated documentation");

			// Test 4: handle multi-line notes with proper formatting
			const state4: State = {
				id: "state-4",
				title: "Complex State",
				status: "To Do",
				assignee: [],
				createdDate: "2025-07-03",
				labels: [],
				dependencies: [],
				description: "Complex state description",
			};
			await core.createState(state4, false);

			const multiLineNotes = `Completed the following:
- Refactored the main module
- Added error boundaries
- Improved performance by 30%

Technical decisions:
- Used memoization for expensive calculations
- Implemented lazy loading`;

			result = await editStatePlatformAware(
				{
					stateId: "4",
					notes: multiLineNotes,
				},
				TEST_DIR,
			);
			expect(result.exitCode).toBe(0);

			updatedState = await core.filesystem.loadState("state-4");
			expect(updatedState).not.toBeNull();
			expect(updatedState?.rawContent).toContain("Refactored the main module");
			expect(updatedState?.rawContent).toContain("Technical decisions:");
			expect(updatedState?.rawContent).toContain("Implemented lazy loading");

			// Test 5: position implementation notes after implementation plan if present
			const state5: State = {
				id: "state-5",
				title: "Planned State",
				status: "To Do",
				assignee: [],
				createdDate: "2025-07-03",
				labels: [],
				dependencies: [],
				rawContent:
					"State with plan\n\n## Acceptance Criteria\n\n- [ ] Works\n\n## Implementation Plan\n\n1. Design\n2. Build\n3. Test",
			};
			await core.createState(state5, false);

			result = await editStatePlatformAware(
				{
					stateId: "5",
					notes: "Followed the plan successfully",
				},
				TEST_DIR,
			);
			expect(result.exitCode).toBe(0);

			updatedState = await core.filesystem.loadState("state-5");
			expect(updatedState).not.toBeNull();
			const desc = updatedState?.rawContent || "";

			// Check that Implementation Notes comes after Implementation Plan
			const planIndex = desc.indexOf("## Implementation Plan");
			const notesIndex = desc.indexOf("## Implementation Notes");
			expect(planIndex).toBeGreaterThan(0);
			expect(notesIndex).toBeGreaterThan(planIndex);

			// Test 6: handle empty notes gracefully
			const state6: State = {
				id: "state-6",
				title: "Test State 6",
				status: "To Do",
				assignee: [],
				createdDate: "2025-07-03",
				labels: [],
				dependencies: [],
				description: "Test description",
			};
			await core.createState(state6, false);

			result = await editStatePlatformAware(
				{
					stateId: "6",
					notes: "",
				},
				TEST_DIR,
			);
			expect(result.exitCode).toBe(0);

			updatedState = await core.filesystem.loadState("state-6");
			expect(updatedState).not.toBeNull();
			// Should not add Implementation Notes section for empty notes
			expect(updatedState?.rawContent).not.toContain("## Implementation Notes");
		});

		it("preserves nested H2 headings when migrating legacy implementation notes", async () => {
			const core = new Core(TEST_DIR);
			const state: State = {
				id: "state-7",
				title: "Legacy Notes",
				status: "To Do",
				assignee: [],
				createdDate: "2025-07-03",
				labels: [],
				dependencies: [],
				rawContent:
					"Initial description\n\n## Implementation Notes\n\nSummary of work\n\n## Follow-up\n\nCapture additional findings",
			};
			await core.createState(state, false);

			const appendResult = await $`bun ${CLI_PATH} state edit 7 --append-notes "Added verification details"`
				.cwd(TEST_DIR)
				.quiet()
				.nothrow();
			expect(appendResult.exitCode).toBe(0);

			const updated = await core.filesystem.loadState("state-7");
			expect(updated).not.toBeNull();
			const body = updated?.rawContent || "";
			expect(body).toContain("<!-- SECTION:NOTES:BEGIN -->");
			const notesContent = extractStructuredSection(body, "implementationNotes") || "";
			expect(notesContent).toContain("## Follow-up");
			expect(notesContent).toContain("Summary of work");
			expect(notesContent).toContain("Added verification details");
		});
	});
});
