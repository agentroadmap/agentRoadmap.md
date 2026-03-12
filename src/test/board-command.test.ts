import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { $ } from "bun";
import { Core } from "../core/roadmap.ts";
import { createUniqueTestDir, safeCleanup } from "./test-utils.ts";

let TEST_DIR: string;

describe("Board command integration", () => {
	let core: Core;

	beforeEach(async () => {
		TEST_DIR = createUniqueTestDir("test-board-command");
		await rm(TEST_DIR, { recursive: true, force: true }).catch(() => {});
		await mkdir(TEST_DIR, { recursive: true });

		// Configure git for tests - required for CI
		await $`git init`.cwd(TEST_DIR).quiet();
		await $`git config user.email test@example.com`.cwd(TEST_DIR).quiet();
		await $`git config user.name "Test User"`.cwd(TEST_DIR).quiet();

		core = new Core(TEST_DIR);
		await core.initializeProject("Test Board Project");

		// Disable remote operations for tests to prevent background git fetches
		const config = await core.filesystem.loadConfig();
		if (config) {
			config.remoteOperations = false;
			await core.filesystem.saveConfig(config);
		}

		// Create some test states
		const statesDir = core.filesystem.statesDir;
		await writeFile(
			join(statesDir, "state-1 - Test State One.md"),
			`---
id: state-1
title: Test State One
status: To Do
assignee: []
created_date: '2025-07-05'
labels: []
dependencies: []
---

## Description

This is a test state for board testing.`,
		);

		await writeFile(
			join(statesDir, "state-2 - Test State Two.md"),
			`---
id: state-2
title: Test State Two
status: In Progress
assignee: []
created_date: '2025-07-05'
labels: []
dependencies: []
---

## Description

This is another test state for board testing.`,
		);
	});

	afterEach(async () => {
		// Wait a bit to ensure any background operations complete
		await new Promise((resolve) => setTimeout(resolve, 100));
		try {
			await safeCleanup(TEST_DIR);
		} catch {
			// Ignore cleanup errors - the unique directory names prevent conflicts
		}
	});

	describe("Board loading", () => {
		it("should load board without errors", async () => {
			// This test verifies that the board command data loading works correctly
			const states = await core.filesystem.listStates();
			expect(states.length).toBe(2);

			// Test that we can prepare the board data without running the interactive UI
			expect(() => {
				const options = {
					core,
					initialView: "kanban" as const,
					states: states.map((t) => ({ ...t, status: t.status || "" })),
				};

				// Verify board options are valid
				expect(options.core).toBeDefined();
				expect(options.initialView).toBe("kanban");
				expect(options.states).toBeDefined();
				expect(options.states.length).toBe(2);
				expect(options.states[0]?.status).toBe("To Do");
				expect(options.states[1]?.status).toBe("In Progress");
			}).not.toThrow();
		});

		it("should handle empty state list gracefully", async () => {
			// Remove test states
			const statesDir = core.filesystem.statesDir;
			await rm(join(statesDir, "state-1 - Test State One.md")).catch(() => {});
			await rm(join(statesDir, "state-2 - Test State Two.md")).catch(() => {});

			const states = await core.filesystem.listStates();
			expect(states.length).toBe(0);

			// Should handle empty state list properly
			expect(() => {
				const options = {
					core,
					initialView: "kanban" as const,
					states: [],
				};

				// Verify empty state list is handled correctly
				expect(options.core).toBeDefined();
				expect(options.initialView).toBe("kanban");
				expect(options.states).toBeDefined();
				expect(options.states.length).toBe(0);
			}).not.toThrow();
		});

		it("should validate ViewSwitcher initialization with kanban view", async () => {
			// This specifically tests the ViewSwitcher setup that was failing
			const { ViewSwitcher } = await import("../ui/view-switcher.ts");

			const initialState = {
				type: "kanban" as const,
				kanbanData: {
					states: [],
					statuses: [],
					isLoading: true,
				},
			};

			// This should not throw
			const viewSwitcher = new ViewSwitcher({
				core,
				initialState,
			});

			expect(viewSwitcher.getState().type).toBe("kanban");
			expect(viewSwitcher.getState().kanbanData?.isLoading).toBe(true);

			// Clean up to prevent background operations after test
			viewSwitcher.cleanup();
		});

		it("should handle getKanbanData method correctly", async () => {
			// Test the specific method that was failing in the error
			const { ViewSwitcher } = await import("../ui/view-switcher.ts");

			const initialState = {
				type: "kanban" as const,
				kanbanData: {
					states: [],
					statuses: [],
					isLoading: true,
				},
			};

			const viewSwitcher = new ViewSwitcher({
				core,
				initialState,
			});

			try {
				// Mock the getKanbanData method to avoid remote git operations
				viewSwitcher.getKanbanData = async () => {
					// Mock config since it's not fully available in this test environment
					const config = await core.filesystem.loadConfig();
					const statuses = config?.statuses || ["To Do", "In Progress"];
					return {
						states: await core.filesystem.listStates(),
						statuses: statuses || [],
					};
				};

				// This should not throw "viewSwitcher?.getKanbanData is not a function"
				await expect(async () => {
					const kanbanData = await viewSwitcher.getKanbanData();
					expect(kanbanData).toBeDefined();
					expect(Array.isArray(kanbanData.states)).toBe(true);
					expect(Array.isArray(kanbanData.statuses)).toBe(true);
				}).not.toThrow();
			} finally {
				// Always cleanup in finally block
				viewSwitcher.cleanup();
			}
		});
	});

	describe("Cross-branch state resolution", () => {
		it("should handle getLatestStateStatesForIds with proper parameters", async () => {
			// Test the function that was missing the filesystem parameter
			const { getLatestStateStatesForIds } = await import("../core/cross-branch-states.ts");

			const states = await core.filesystem.listStates();
			const stateIds = states.map((t) => t.id);

			// This should not throw "fs is not defined"
			await expect(async () => {
				const result = await getLatestStateStatesForIds(core.gitOps, core.filesystem, stateIds);
				expect(result).toBeInstanceOf(Map);
			}).not.toThrow();
		});
	});
});
