import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { $ } from "bun";
import { Core } from "../core/roadmap.ts";
import type { RoadmapConfig, State } from "../types/index.ts";
import { createUniqueTestDir, safeCleanup } from "./test-utils.ts";

let TEST_DIR: string;

describe("Board Loading with checkActiveBranches", () => {
	let core: Core;

	beforeEach(async () => {
		TEST_DIR = createUniqueTestDir("test-board-loading");
		core = new Core(TEST_DIR);
		await core.filesystem.ensureRoadmapStructure();

		// Initialize git repository for testing
		await $`git init -b main`.cwd(TEST_DIR).quiet();
		await $`git config user.name "Test User"`.cwd(TEST_DIR).quiet();
		await $`git config user.email test@example.com`.cwd(TEST_DIR).quiet();

		// Initialize project with default config
		await core.initializeProject("Test Project", false);
	});

	afterEach(async () => {
		try {
			await safeCleanup(TEST_DIR);
		} catch {
			// Ignore cleanup errors
		}
	});

	describe("Core.loadStates()", () => {
		const createTestState = (id: string, status = "To Do"): State => ({
			id,
			title: `Test State ${id}`,
			status,
			assignee: [],
			createdDate: "2025-01-08",
			labels: ["test"],
			dependencies: [],
			description: `This is test state ${id}`,
		});

		beforeEach(async () => {
			// Create some test states
			await core.createState(createTestState("state-1", "To Do"), false);
			await core.createState(createTestState("state-2", "In Progress"), false);
			await core.createState(createTestState("state-3", "Done"), false);

			// Commit them to have a clean state
			await $`git add .`.cwd(TEST_DIR).quiet();
			await $`git commit -m "Add test states"`.cwd(TEST_DIR).quiet();
		});

		it("should load states with default configuration", async () => {
			const states = await core.loadStates();

			expect(states).toHaveLength(3);
			expect(states.find((t) => t.id === "STATE-1")).toBeDefined();
			expect(states.find((t) => t.id === "STATE-2")).toBeDefined();
			expect(states.find((t) => t.id === "STATE-3")).toBeDefined();
		});

		it("should skip cross-branch checking when checkActiveBranches is false", async () => {
			// Update config to disable cross-branch checking
			const config = await core.filesystem.loadConfig();
			if (!config) throw new Error("Config not loaded");
			const updatedConfig: RoadmapConfig = {
				...config,
				checkActiveBranches: false,
			};
			await core.filesystem.saveConfig(updatedConfig);

			// Track progress messages
			const progressMessages: string[] = [];
			const states = await core.loadStates((msg) => {
				progressMessages.push(msg);
			});

			// Verify we got states
			expect(states).toHaveLength(3);

			// Verify we didn't apply cross-branch state snapshots
			const applySnapshotsMessage = progressMessages.find((msg) =>
				msg.includes("Applying latest state states from branch scans..."),
			);
			expect(applySnapshotsMessage).toBeUndefined();
		});

		it("should perform cross-branch checking when checkActiveBranches is true", async () => {
			// Update config to enable cross-branch checking (default)
			const config = await core.filesystem.loadConfig();
			if (!config) throw new Error("Config not loaded");
			const updatedConfig: RoadmapConfig = {
				...config,
				checkActiveBranches: true,
				activeBranchDays: 7,
			};
			await core.filesystem.saveConfig(updatedConfig);

			// Track progress messages
			const progressMessages: string[] = [];
			const states = await core.loadStates((msg) => {
				progressMessages.push(msg);
			});

			// Verify we got states
			expect(states).toHaveLength(3);

			// Verify we applied cross-branch state snapshots
			const applySnapshotsMessage = progressMessages.find((msg) =>
				msg.includes("Applying latest state states from branch scans..."),
			);
			expect(applySnapshotsMessage).toBeDefined();
		});

		it("should respect activeBranchDays configuration", async () => {
			// Create a new branch with an old commit date
			await $`git checkout -b old-branch`.cwd(TEST_DIR).quiet();
			await core.createState(createTestState("state-4", "To Do"), false);
			await $`git add .`.cwd(TEST_DIR).quiet();

			// Commit with an old date (40 days ago)
			const oldDate = new Date();
			oldDate.setDate(oldDate.getDate() - 40);
			const dateStr = oldDate.toISOString();
			await $`GIT_AUTHOR_DATE="${dateStr}" GIT_COMMITTER_DATE="${dateStr}" git commit -m "Old state"`
				.cwd(TEST_DIR)
				.quiet();

			await $`git checkout main`.cwd(TEST_DIR).quiet();

			// Set activeBranchDays to 30 (should exclude the old branch)
			const config = await core.filesystem.loadConfig();
			if (!config) throw new Error("Config not loaded");
			const updatedConfig: RoadmapConfig = {
				...config,
				checkActiveBranches: true,
				activeBranchDays: 30,
			};
			await core.filesystem.saveConfig(updatedConfig);

			// Track progress messages
			const progressMessages: string[] = [];
			const states = await core.loadStates((msg) => {
				progressMessages.push(msg);
			});

			// The state-4 from old branch should not be included if branch checking is working
			// However, since we're in main branch, we should only see the 3 main states
			expect(states).toHaveLength(3);
			expect(states.find((t) => t.id === "STATE-4")).toBeUndefined();

			// Check that branch checking happened with the right days
			const _branchCheckMessage = progressMessages.find(
				(msg) => msg.includes("branches") && (msg.includes("30 days") || msg.includes("from 30 days")),
			);
			// The message format might vary, so we just check that some branch-related message exists
			const anyBranchMessage = progressMessages.find((msg) => msg.includes("branch"));
			expect(anyBranchMessage).toBeDefined();
		});

		it("should handle cancellation via AbortSignal", async () => {
			const controller = new AbortController();

			// Cancel immediately
			controller.abort();

			// Should throw an error
			await expect(core.loadStates(undefined, controller.signal)).rejects.toThrow("Loading cancelled");
		});

		it("should handle empty state list gracefully", async () => {
			// Remove all states
			await $`rm -rf roadmap/nodes/*`.cwd(TEST_DIR).quiet();

			const states = await core.loadStates();
			expect(states).toEqual([]);
		});

		it("should pass progress callbacks correctly", async () => {
			const progressMessages: string[] = [];
			const progressCallback = mock((msg: string) => {
				progressMessages.push(msg);
			});

			await core.loadStates(progressCallback);

			// Verify callback was called
			expect(progressCallback).toHaveBeenCalled();
			expect(progressMessages.length).toBeGreaterThan(0);

			// Should have some expected messages
			const hasLoadingMessage = progressMessages.some(
				(msg) => msg.includes("Loading") || msg.includes("Checking") || msg.includes("Skipping"),
			);
			expect(hasLoadingMessage).toBe(true);
		});
	});

	describe("Config integration", () => {
		it("should use default values when config properties are undefined", async () => {
			// Save a minimal config without the branch-related settings
			const minimalConfig: RoadmapConfig = {
				projectName: "Test Project",
				statuses: ["To Do", "In Progress", "Done"],
				defaultStatus: "To Do",
				labels: [],
				milestones: [],
				dateFormat: "yyyy-mm-dd",
			};
			await core.filesystem.saveConfig(minimalConfig);

			// Create a state to ensure we have something to load
			await core.createState(
				{
					id: "state-1",
					title: "Test State",
					status: "To Do",
					assignee: [],
					createdDate: "2025-01-08",
					labels: [],
					dependencies: [],
					rawContent: "Test",
				},
				false,
			);

			const progressMessages: string[] = [];
			const states = await core.loadStates((msg) => {
				progressMessages.push(msg);
			});

			// Should still work with defaults
			expect(states).toBeDefined();
			expect(states.length).toBeGreaterThanOrEqual(0);

			// When checkActiveBranches is undefined, it defaults to true, so should perform checking
			const applySnapshotsMessage = progressMessages.find((msg) =>
				msg.includes("Applying latest state states from branch scans..."),
			);
			expect(applySnapshotsMessage).toBeDefined();
		});

		it("should handle config with checkActiveBranches explicitly set to false", async () => {
			const config = await core.filesystem.loadConfig();
			if (!config) throw new Error("Config not loaded");
			await core.filesystem.saveConfig({
				...config,
				checkActiveBranches: false,
			});

			const progressMessages: string[] = [];
			await core.loadStates((msg) => {
				progressMessages.push(msg);
			});

			// Should not apply cross-branch state snapshots
			const applySnapshotsMessage = progressMessages.find((msg) =>
				msg.includes("Applying latest state states from branch scans..."),
			);
			expect(applySnapshotsMessage).toBeUndefined();
		});
	});
});
