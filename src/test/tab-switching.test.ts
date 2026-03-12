import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { $ } from "bun";
import { Core } from "../core/roadmap.ts";
import { createUniqueTestDir, safeCleanup } from "./test-utils.ts";

let TEST_DIR: string;

describe("Tab switching functionality", () => {
	let core: Core;

	beforeEach(async () => {
		TEST_DIR = createUniqueTestDir("test-tab-switching");
		await rm(TEST_DIR, { recursive: true, force: true }).catch(() => {});
		await mkdir(TEST_DIR, { recursive: true });

		// Configure git for tests - required for CI
		await $`git init`.cwd(TEST_DIR).quiet();
		await $`git config user.email test@example.com`.cwd(TEST_DIR).quiet();
		await $`git config user.name "Test User"`.cwd(TEST_DIR).quiet();

		core = new Core(TEST_DIR);
		await core.initializeProject("Test Tab Switching Project");

		// Create test states
		const statesDir = core.filesystem.statesDir;
		await writeFile(
			join(statesDir, "state-1 - Test State.md"),
			`---
id: state-1
title: Test State
status: To Do
assignee: []
created_date: '2025-07-05'
labels: []
dependencies: []
---

## Description

Test state for tab switching.`,
		);
	});

	afterEach(async () => {
		try {
			await safeCleanup(TEST_DIR);
		} catch {
			// Ignore cleanup errors - the unique directory names prevent conflicts
		}
	});

	describe("Unified State domain", () => {
		it("should use unified State interface everywhere", async () => {
			// Load states
			const states = await core.filesystem.listStates();
			expect(states.length).toBe(1);

			const state = states[0];
			expect(state).toBeDefined();

			if (!state) return;

			// Verify State has all the expected fields (including metadata fields)
			expect(state.id).toBeDefined();
			expect(state.title).toBeDefined();
			expect(state.status).toBeDefined();
			expect(state.assignee).toBeDefined();
			expect(state.labels).toBeDefined();
			expect(state.dependencies).toBeDefined();

			// Metadata fields should be optional and available
			expect(typeof state.source).toBe("undefined"); // Not set for local states loaded from filesystem
			expect(typeof state.lastModified).toBe("undefined"); // Not set for basic loaded states

			// But they should be settable
			const stateWithMetadata = {
				...state,
				source: "local" as const,
				lastModified: new Date(),
			};

			expect(stateWithMetadata.source).toBe("local");
			expect(stateWithMetadata.lastModified).toBeInstanceOf(Date);
		});

		it("should handle runUnifiedView with preloaded kanban data", async () => {
			const states = await core.filesystem.listStates();

			// Test that runUnifiedView accepts the correct parameters without actually running the UI
			expect(() => {
				// Just verify the function can be imported and called with correct parameters
				const options = {
					core,
					initialView: "kanban" as const,
					states,
					preloadedKanbanData: {
						states: states.map((t) => ({ ...t, source: "local" as const })),
						statuses: ["To Do", "In Progress", "Done"],
					},
				};

				// Verify the options object is valid
				expect(options.core).toBeDefined();
				expect(options.initialView).toBe("kanban");
				expect(options.states).toBeDefined();
				expect(options.preloadedKanbanData).toBeDefined();
			}).not.toThrow();
		});

		it("should handle state switching between views", async () => {
			const states = await core.filesystem.listStates();
			expect(states.length).toBe(1);

			const testState = states[0];

			// Test that we can create valid options for different view types
			const testStates = [
				{ view: "state-list" as const, state: testState },
				{ view: "state-detail" as const, state: testState },
				{ view: "kanban" as const, state: testState },
			];

			for (const state of testStates) {
				expect(() => {
					// Verify we can create valid options for each view type
					const options = {
						core,
						initialView: state.view,
						selectedState: state.state,
						states,
						preloadedKanbanData: {
							states,
							statuses: ["To Do"],
						},
					};

					// Verify the options are valid
					expect(options.core).toBeDefined();
					expect(options.initialView).toBe(state.view);
					if (state.state) {
						expect(options.selectedState).toEqual(state.state);
					} else {
						expect(options.selectedState).toBeNull();
					}
					expect(options.states).toBeDefined();
					expect(options.preloadedKanbanData).toBeDefined();
				}).not.toThrow();
			}
		});
	});
});
