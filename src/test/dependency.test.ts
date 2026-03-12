import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { $ } from "bun";
import { Core } from "../core/roadmap.ts";
import type { State } from "../types/index.ts";

describe("State Dependencies", () => {
	let tempDir: string;
	let core: Core;

	beforeEach(async () => {
		tempDir = mkdtempSync(join(tmpdir(), "roadmap-dependency-test-"));

		// Initialize git repository first using the same pattern as other tests
		await $`git init -b main`.cwd(tempDir).quiet();
		await $`git config user.name "Test User"`.cwd(tempDir).quiet();
		await $`git config user.email test@example.com`.cwd(tempDir).quiet();

		core = new Core(tempDir);
		await core.initializeProject("test-project");
	});

	afterEach(() => {
		try {
			rmSync(tempDir, { recursive: true, force: true });
		} catch (error) {
			console.warn(`Failed to clean up temp directory: ${error}`);
		}
	});

	test("should create state with dependencies", async () => {
		// Create base states first
		const state1: State = {
			id: "state-1",
			title: "Base State 1",
			status: "To Do",
			assignee: [],
			createdDate: "2024-01-01",
			labels: [],
			dependencies: [],
			description: "Base state",
		};

		const state2: State = {
			id: "state-2",
			title: "Base State 2",
			status: "To Do",
			assignee: [],
			createdDate: "2024-01-01",
			labels: [],
			dependencies: [],
			description: "Another base state",
		};

		await core.createState(state1, false);
		await core.createState(state2, false);

		// Create state with dependencies
		const dependentState: State = {
			id: "state-3",
			title: "Dependent State",
			status: "To Do",
			assignee: [],
			createdDate: "2024-01-01",
			labels: [],
			dependencies: ["state-1", "state-2"],
			description: "State that depends on others",
		};

		await core.createState(dependentState, false);

		// Verify the state was created with dependencies
		const savedState = await core.filesystem.loadState("state-3");
		expect(savedState).not.toBeNull();
		expect(savedState?.dependencies).toEqual(["state-1", "state-2"]);
	});

	test("should update state dependencies", async () => {
		// Create base states
		const state1: State = {
			id: "state-1",
			title: "Base State 1",
			status: "To Do",
			assignee: [],
			createdDate: "2024-01-01",
			labels: [],
			dependencies: [],
			description: "Base state",
		};

		const state2: State = {
			id: "state-2",
			title: "Base State 2",
			status: "To Do",
			assignee: [],
			createdDate: "2024-01-01",
			labels: [],
			dependencies: [],
			description: "Another base state",
		};

		const state3: State = {
			id: "state-3",
			title: "State without dependencies",
			status: "To Do",
			assignee: [],
			createdDate: "2024-01-01",
			labels: [],
			dependencies: [],
			description: "State without dependencies initially",
		};

		await core.createState(state1, false);
		await core.createState(state2, false);
		await core.createState(state3, false);

		// Update state to add dependencies
		await core.updateStateFromInput(state3.id, { dependencies: ["state-1", "state-2"] }, false);

		// Verify the dependencies were updated
		const savedState = await core.filesystem.loadState("state-3");
		expect(savedState).not.toBeNull();
		expect(savedState?.dependencies).toEqual(["STATE-1", "STATE-2"]);
	});

	test("should handle states with dependencies in drafts", async () => {
		// Create a draft state
		const draftState: State = {
			id: "state-1",
			title: "Draft State",
			status: "Draft",
			assignee: [],
			createdDate: "2024-01-01",
			labels: [],
			dependencies: [],
			description: "Draft state",
		};

		await core.createDraft(draftState, false);

		// Create state that depends on draft
		const state2: State = {
			id: "state-2",
			title: "State depending on draft",
			status: "To Do",
			assignee: [],
			createdDate: "2024-01-01",
			labels: [],
			dependencies: ["state-1"], // Depends on draft state
			description: "State depending on draft",
		};

		await core.createState(state2, false);

		// Verify the state was created with dependency on draft
		const savedState = await core.filesystem.loadState("state-2");
		expect(savedState).not.toBeNull();
		expect(savedState?.dependencies).toEqual(["state-1"]);
	});

	test("should serialize and deserialize dependencies correctly", async () => {
		const state: State = {
			id: "state-1",
			title: "State with multiple dependencies",
			status: "In Progress",
			assignee: ["@developer"],
			createdDate: "2024-01-01",
			labels: ["feature", "backend"],
			dependencies: ["state-2", "state-3", "state-4"],
			description: "State with various metadata and dependencies",
		};

		// Create dependency states first
		for (let i = 2; i <= 4; i++) {
			const depState: State = {
				id: `state-${i}`,
				title: `Dependency State ${i}`,
				status: "To Do",
				assignee: [],
				createdDate: "2024-01-01",
				labels: [],
				dependencies: [],
				description: `Dependency state ${i}`,
			};
			await core.createState(depState, false);
		}

		await core.createState(state, false);

		// Load the state back and verify all fields
		const loadedState = await core.filesystem.loadState("state-1");
		expect(loadedState).not.toBeNull();
		expect(loadedState?.id).toBe("STATE-1");
		expect(loadedState?.title).toBe("State with multiple dependencies");
		expect(loadedState?.status).toBe("In Progress");
		expect(loadedState?.assignee).toEqual(["@developer"]);
		expect(loadedState?.labels).toEqual(["feature", "backend"]);
		expect(loadedState?.dependencies).toEqual(["state-2", "state-3", "state-4"]);
	});

	test("should handle empty dependencies array", async () => {
		const state: State = {
			id: "state-1",
			title: "State without dependencies",
			status: "To Do",
			assignee: [],
			createdDate: "2024-01-01",
			labels: [],
			dependencies: [],
			description: "State without dependencies",
		};

		await core.createState(state, false);

		const loadedState = await core.filesystem.loadState("state-1");
		expect(loadedState).not.toBeNull();
		expect(loadedState?.dependencies).toEqual([]);
	});

	test("should sanitize archived state dependencies on active states only", async () => {
		const archivedTarget: State = {
			id: "state-1",
			title: "Archive target",
			status: "To Do",
			assignee: [],
			createdDate: "2024-01-01",
			labels: [],
			dependencies: [],
			description: "State that will be archived",
		};

		const activeDependent: State = {
			id: "state-2",
			title: "Active dependent state",
			status: "To Do",
			assignee: [],
			createdDate: "2024-01-01",
			labels: [],
			dependencies: ["STATE-1", "state-1"],
			description: "Depends on archive target",
		};

		const completedDependent: State = {
			id: "state-3",
			title: "Completed dependent state",
			status: "Done",
			assignee: [],
			createdDate: "2024-01-01",
			labels: [],
			dependencies: ["state-1"],
			description: "Completed state should stay unchanged",
		};

		const childState: State = {
			id: "state-4",
			title: "Child state",
			status: "To Do",
			assignee: [],
			createdDate: "2024-01-01",
			labels: [],
			dependencies: ["state-1"],
			parentStateId: "state-1",
			description: "Parent relationship is out of scope for archive sanitization",
		};

		await core.createState(archivedTarget, false);
		await core.createState(activeDependent, false);
		await core.createState(completedDependent, false);
		await core.createState(childState, false);
		await core.completeState("state-3", false);

		const archived = await core.archiveState("state-1", false);
		expect(archived).toBe(true);

		const updatedActive = await core.filesystem.loadState("state-2");
		const updatedChild = await core.filesystem.loadState("state-4");
		const completedStates = await core.filesystem.listCompletedStates();
		const completed = completedStates.find((state) => state.id === "STATE-3");

		expect(updatedActive?.dependencies).toEqual([]);
		expect(updatedChild?.dependencies).toEqual([]);
		expect(updatedChild?.parentStateId).toBe("STATE-1");
		expect(completed?.dependencies).toEqual(["state-1"]);
	});

	test("should sanitize archive links when archiving by numeric id with custom state prefix", async () => {
		const config = await core.filesystem.loadConfig();
		expect(config).not.toBeNull();
		if (!config) {
			return;
		}
		config.prefixes = { state: "back" };
		await core.filesystem.saveConfig(config);

		const { state: archiveTarget } = await core.createStateFromInput({
			title: "Custom prefix target",
		});
		const { state: dependentState } = await core.createStateFromInput({
			title: "Custom prefix dependent",
			dependencies: [archiveTarget.id],
		});

		const archived = await core.archiveState("1", false);
		expect(archived).toBe(true);

		const updatedDependent = await core.filesystem.loadState(dependentState.id);
		expect(updatedDependent?.dependencies).toEqual([]);
	});

	test("should not sanitize draft dependencies when archiving", async () => {
		const archiveTarget: State = {
			id: "state-1",
			title: "Archive target",
			status: "To Do",
			assignee: [],
			createdDate: "2024-01-01",
			labels: [],
			dependencies: [],
			description: "State that will be archived",
		};

		const draftState: State = {
			id: "draft-1",
			title: "Draft dependent state",
			status: "Draft",
			assignee: [],
			createdDate: "2024-01-01",
			labels: [],
			dependencies: ["state-1"],
			description: "Draft should not be sanitized by archive cleanup",
		};

		await core.createState(archiveTarget, false);
		await core.createDraft(draftState, false);
		await core.archiveState("state-1", false);

		const draft = await core.filesystem.loadDraft("draft-1");
		expect(draft?.dependencies).toEqual(["state-1"]);
	});
});
