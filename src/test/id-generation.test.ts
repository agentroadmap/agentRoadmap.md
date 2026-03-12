import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Core } from "../core/roadmap.ts";
import { serializeState } from "../markdown/serializer.ts";
import type { State } from "../types/index.ts";

const TEST_DIR = join(tmpdir(), "roadmap-id-gen-test");

describe("State ID Generation with Archives", () => {
	let core: Core;
	let testDir: string;

	beforeEach(async () => {
		testDir = await mkdtemp(TEST_DIR);
		core = new Core(testDir);
		await core.initializeProject("Test Project", false);
	});

	afterEach(async () => {
		try {
			await rm(testDir, { recursive: true, force: true });
		} catch {
			// Ignore cleanup errors
		}
	});

	it("should reuse IDs from archived states (soft delete behavior)", async () => {
		// Create states 1-5
		await core.createStateFromInput({ title: "State 1" }, false);
		await core.createStateFromInput({ title: "State 2" }, false);
		await core.createStateFromInput({ title: "State 3" }, false);
		await core.createStateFromInput({ title: "State 4" }, false);
		await core.createStateFromInput({ title: "State 5" }, false);

		// Archive all states
		await core.archiveState("state-1", false);
		await core.archiveState("state-2", false);
		await core.archiveState("state-3", false);
		await core.archiveState("state-4", false);
		await core.archiveState("state-5", false);

		// Verify states directory has no active states
		const activeStates = await core.fs.listStates();
		expect(activeStates.length).toBe(0);

		// Create new state - should be STATE-1 (archived IDs can be reused)
		const result = await core.createStateFromInput({ title: "State After Archive" }, false);
		expect(result.state.id).toBe("STATE-1");

		// Verify the state was created with correct ID
		const newState = await core.getState("state-1");
		expect(newState).not.toBeNull();
		expect(newState?.title).toBe("State After Archive");
	});

	it("should consider completed states but not archived states for ID generation", async () => {
		// Create states 1-3
		await core.createStateFromInput({ title: "State 1", status: "Todo" }, false);
		await core.createStateFromInput({ title: "State 2", status: "Todo" }, false);
		await core.createStateFromInput({ title: "State 3", status: "Todo" }, false);

		// Archive state-1 (its ID can be reused)
		await core.archiveState("state-1", false);

		// Complete state-2 (moves to completed directory, ID cannot be reused)
		await core.completeState("state-2", false);

		// Keep state-3 active
		const activeStates = await core.fs.listStates();
		expect(activeStates.length).toBe(1);
		expect(activeStates[0]?.id).toBe("STATE-3");

		// Create new state - should be STATE-4 (max of active 3 + completed 2 is 3, so next is 4)
		// Note: archived STATE-1 is NOT considered, so its ID could be reused if 2 and 3 weren't taken
		const result = await core.createStateFromInput({ title: "State 4" }, false);
		expect(result.state.id).toBe("STATE-4");

		// Verify archived state still exists
		const archivedStates = await core.fs.listArchivedStates();
		expect(archivedStates.some((t) => t.id === "STATE-1")).toBe(true);

		// Verify completed state still exists
		const completedStates = await core.fs.listCompletedStates();
		expect(completedStates.some((t) => t.id === "STATE-2")).toBe(true);
	});

	it("should handle substates correctly with archived parents", async () => {
		// Create parent state-1
		await core.createStateFromInput({ title: "Parent State" }, false);

		// Create substates
		const substate1 = await core.createStateFromInput({ title: "Substate 1", parentStateId: "state-1" }, false);
		const substate2 = await core.createStateFromInput({ title: "Substate 2", parentStateId: "state-1" }, false);

		expect(substate1.state.id).toBe("STATE-1.1");
		expect(substate2.state.id).toBe("STATE-1.2");

		// Archive parent and all substates
		await core.archiveState("state-1", false);
		await core.archiveState("state-1.1", false);
		await core.archiveState("state-1.2", false);

		// Create new parent state - should be STATE-1 (reusing archived parent ID)
		const newParent = await core.createStateFromInput({ title: "New Parent" }, false);
		expect(newParent.state.id).toBe("STATE-1");

		// Create substate of new parent (STATE-1) - should be STATE-1.1 (reusing archived substate ID)
		const newSubstate = await core.createStateFromInput({ title: "New Substate", parentStateId: "state-1" }, false);
		expect(newSubstate.state.id).toBe("STATE-1.1");
	});

	it("should work with zero-padded IDs and reuse archived IDs", async () => {
		// Update config to use zero-padded IDs
		const config = await core.fs.loadConfig();
		if (config) {
			config.zeroPaddedIds = 3;
			await core.fs.saveConfig(config);
		}

		// Create and archive states with padding
		await core.createStateFromInput({ title: "State 1" }, false);
		const state1 = await core.getState("state-001");
		expect(state1?.id).toBe("STATE-001");

		await core.archiveState("state-001", false);

		// Create new state - should reuse archived ID (STATE-001)
		const result = await core.createStateFromInput({ title: "State 2" }, false);
		expect(result.state.id).toBe("STATE-001");
	});

	it("should detect existing substates with different casing (legacy data)", async () => {
		// Create parent state via Core (will be uppercase STATE-1)
		await core.createStateFromInput({ title: "Parent State" }, false);

		// Simulate legacy lowercase substate by directly writing to filesystem
		// This represents a file created before the uppercase ID change
		const statesDir = core.fs.statesDir;
		const legacySubstate: State = {
			id: "state-1.1", // Lowercase - legacy format
			title: "Legacy Substate",
			status: "To Do",
			assignee: [],
			createdDate: "2025-01-01",
			labels: [],
			dependencies: [],
			parentStateId: "state-1",
		};
		const content = serializeState(legacySubstate);
		await Bun.write(join(statesDir, "state-1.1 - Legacy Substate.md"), content);

		// Create new substate via Core - should detect the legacy substate and get STATE-1.2
		// BUG: Currently returns STATE-1.1 due to case-sensitive startsWith() check
		const newSubstate = await core.createStateFromInput({ title: "New Substate", parentStateId: "state-1" }, false);
		expect(newSubstate.state.id).toBe("STATE-1.2");
	});
});
