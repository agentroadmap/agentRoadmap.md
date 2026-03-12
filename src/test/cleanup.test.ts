import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { $ } from "bun";
import { Core } from "../core/roadmap.ts";
import type { State } from "../types/index.ts";
import { createUniqueTestDir, safeCleanup } from "./test-utils.ts";

let TEST_DIR: string;

describe("Cleanup functionality", () => {
	let core: Core;

	// Sample data
	const sampleState: State = {
		id: "state-1",
		title: "Test State",
		status: "Done",
		assignee: [],
		createdDate: "2025-07-21",
		labels: [],
		dependencies: [],
		rawContent: "Test state description",
	};

	beforeEach(async () => {
		TEST_DIR = createUniqueTestDir("test-cleanup");
		try {
			await rm(TEST_DIR, { recursive: true, force: true });
		} catch {
			// Ignore cleanup errors
		}
		await mkdir(TEST_DIR, { recursive: true });

		// Initialize git repo
		await $`git init -b main`.cwd(TEST_DIR).quiet();
		await $`git config user.name "Test User"`.cwd(TEST_DIR).quiet();
		await $`git config user.email test@example.com`.cwd(TEST_DIR).quiet();

		// Initialize roadmap project
		core = new Core(TEST_DIR);
		await core.initializeProject("Cleanup Test Project");
	});

	afterEach(async () => {
		try {
			await safeCleanup(TEST_DIR);
		} catch {
			// Ignore cleanup errors - the unique directory names prevent conflicts
		}
	});

	describe("Core functionality", () => {
		it("should create completed directory in roadmap structure", async () => {
			await core.filesystem.ensureRoadmapStructure();
			expect(core.filesystem.completedDir).toBe(join(TEST_DIR, "roadmap", "completed"));
		});

		it("should move Done state to completed folder", async () => {
			// Create a state
			await core.createState(sampleState, false);

			// Verify state exists in active states
			const activeStates = await core.filesystem.listStates();
			expect(activeStates).toHaveLength(1);
			expect(activeStates[0]?.id).toBe("STATE-1");

			// Move to completed
			const success = await core.completeState("state-1", false);
			expect(success).toBe(true);

			// Verify state is no longer in active states
			const activeStatesAfter = await core.filesystem.listStates();
			expect(activeStatesAfter).toHaveLength(0);

			// Verify state is in completed states
			const completedStates = await core.filesystem.listCompletedStates();
			expect(completedStates).toHaveLength(1);
			expect(completedStates[0]?.id).toBe("STATE-1");
			expect(completedStates[0]?.title).toBe("Test State");
		});
	});

	describe("getDoneStatesByAge", () => {
		it("should filter Done states by age", async () => {
			// Create old Done state (7 days ago)
			const oldDate = new Date();
			oldDate.setDate(oldDate.getDate() - 7);
			const oldState: State = {
				...sampleState,
				title: "Old Done State",
				createdDate: oldDate.toISOString().split("T")[0] as string,
				updatedDate: oldDate.toISOString().split("T")[0] as string,
				rawContent: "Old state description",
			};
			await core.createState(oldState, false);

			// Create recent Done state (1 day ago)
			const recentDate = new Date();
			recentDate.setDate(recentDate.getDate() - 1);
			const recentState: State = {
				...sampleState,
				id: "state-2",
				title: "Recent Done State",
				createdDate: recentDate.toISOString().split("T")[0] as string,
				updatedDate: recentDate.toISOString().split("T")[0] as string,
				rawContent: "Recent state description",
			};
			await core.createState(recentState, false);

			// Create In Progress state
			const activeState: State = {
				...sampleState,
				id: "state-3",
				title: "Active State",
				status: "In Progress",
				createdDate: oldDate.toISOString().split("T")[0] as string,
				rawContent: "Active state description",
			};
			await core.createState(activeState, false);

			// Get states older than 3 days
			const oldStates = await core.getDoneStatesByAge(3);
			expect(oldStates).toHaveLength(1);
			expect(oldStates[0]?.id).toBe("STATE-1");

			// Get states older than 0 days (should include recent state too)
			const allDoneStates = await core.getDoneStatesByAge(0);
			expect(allDoneStates).toHaveLength(2);
		});

		it("should handle states without dates", async () => {
			const state: State = {
				...sampleState,
				title: "State Without Date",
				createdDate: "",
				rawContent: "State description",
			};
			await core.createState(state, false);

			const oldStates = await core.getDoneStatesByAge(1);
			expect(oldStates).toHaveLength(0); // Should not include states without valid dates
		});

		it("should use updatedDate over createdDate when available", async () => {
			const oldDate = new Date();
			oldDate.setDate(oldDate.getDate() - 10);
			const recentDate = new Date();
			recentDate.setDate(recentDate.getDate() - 1);

			const state: State = {
				id: "state-1",
				title: "State with Both Dates",
				status: "Done",
				assignee: [],
				createdDate: oldDate.toISOString().split("T")[0] as string,
				updatedDate: recentDate.toISOString().split("T")[0] as string,
				labels: [],
				dependencies: [],
				rawContent: "State description",
			};
			await core.createState(state, false);

			// Should use updatedDate (recent) not createdDate (old)
			const oldStates = await core.getDoneStatesByAge(5);
			expect(oldStates).toHaveLength(0); // updatedDate is recent, so not old enough

			const recentStates = await core.getDoneStatesByAge(0);
			expect(recentStates).toHaveLength(1); // updatedDate makes it recent
		});
	});

	describe("Error handling", () => {
		it("should handle non-existent state gracefully", async () => {
			const success = await core.completeState("non-existent", false);
			expect(success).toBe(false);
		});

		it("should return empty array for listCompletedStates when no completed states exist", async () => {
			const completedStates = await core.filesystem.listCompletedStates();
			expect(completedStates).toHaveLength(0);
		});
	});
});
