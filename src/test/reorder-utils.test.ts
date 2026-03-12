import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { $ } from "bun";
import { Core } from "../core/roadmap.ts";
import { calculateNewOrdinal, DEFAULT_ORDINAL_STEP, resolveOrdinalConflicts } from "../core/reorder.ts";
import { serializeState } from "../markdown/serializer.ts";
import type { State } from "../types/index.ts";
import { createUniqueTestDir, safeCleanup } from "./test-utils.ts";

const item = (id: string, ordinal?: number) => ({ id, ordinal });

let TEST_DIR: string;
let core: Core;

const FIXED_DATE = "2025-01-01 00:00";

const buildState = (id: string, status: string, ordinal?: number): State => ({
	id,
	title: `State ${id}`,
	status,
	assignee: [],
	createdDate: FIXED_DATE,
	labels: [],
	dependencies: [],
	...(ordinal !== undefined ? { ordinal } : {}),
});

beforeEach(async () => {
	TEST_DIR = createUniqueTestDir("reorder-utils");
	await mkdir(TEST_DIR, { recursive: true });
	await $`git init -b main`.cwd(TEST_DIR).quiet();
	await $`git config user.name "Test User"`.cwd(TEST_DIR).quiet();
	await $`git config user.email test@example.com`.cwd(TEST_DIR).quiet();
	core = new Core(TEST_DIR);
	await core.initializeProject("Reorder Utilities Test Project");
});

afterEach(async () => {
	await safeCleanup(TEST_DIR);
});

describe("calculateNewOrdinal", () => {
	it("returns default step when no neighbors exist", () => {
		const result = calculateNewOrdinal({});
		expect(result.ordinal).toBe(DEFAULT_ORDINAL_STEP);
		expect(result.requiresRebalance).toBe(false);
	});

	it("averages ordinals when both neighbors exist", () => {
		const result = calculateNewOrdinal({
			previous: item("a", 1000),
			next: item("b", 3000),
		});
		expect(result.ordinal).toBe(2000);
		expect(result.requiresRebalance).toBe(false);
	});

	it("flags rebalance when there is no gap between neighbors", () => {
		const result = calculateNewOrdinal({
			previous: item("a", 2000),
			next: item("b", 2000),
		});
		expect(result.requiresRebalance).toBe(true);
	});

	it("appends step when dropping after the last state", () => {
		const result = calculateNewOrdinal({
			previous: item("a", 4000),
		});
		expect(result.ordinal).toBe(4000 + DEFAULT_ORDINAL_STEP);
		expect(result.requiresRebalance).toBe(false);
	});
});

describe("resolveOrdinalConflicts", () => {
	it("returns empty array when ordinals are already increasing", () => {
		const updates = resolveOrdinalConflicts([item("a", 1000), item("b", 2000), item("c", 3000)]);
		expect(updates).toHaveLength(0);
	});

	it("reassigns duplicate or descending ordinals", () => {
		const updates = resolveOrdinalConflicts([item("a", 1000), item("b", 1000), item("c", 2000)]);
		expect(updates).toHaveLength(2);
		expect(updates[0]).toEqual({ id: "b", ordinal: 2000 });
		expect(updates[1]).toEqual({ id: "c", ordinal: 3000 });
	});

	it("fills in missing ordinals with default spacing", () => {
		const updates = resolveOrdinalConflicts([item("a"), item("b"), item("c", 1500)]);
		expect(updates).toHaveLength(3);
		expect(updates[0]).toEqual({ id: "a", ordinal: DEFAULT_ORDINAL_STEP });
		expect(updates[1]).toEqual({ id: "b", ordinal: DEFAULT_ORDINAL_STEP * 2 });
		expect(updates[2]).toEqual({ id: "c", ordinal: DEFAULT_ORDINAL_STEP * 3 });
	});

	it("can force sequential reassignment when requested", () => {
		const updates = resolveOrdinalConflicts([item("a", 1000), item("b", 2500), item("c", 4500)], {
			forceSequential: true,
		});
		expect(updates).toHaveLength(2);
		expect(updates[0]).toEqual({ id: "b", ordinal: 2000 });
		expect(updates[1]).toEqual({ id: "c", ordinal: 3000 });
	});
});

describe("Core.reorderState", () => {
	const createStates = async (states: Array<[string, string, number?]>) => {
		for (const [id, status, ordinal] of states) {
			await core.createState(buildState(id, status, ordinal), false);
		}
	};

	it("reorders within a column without touching unaffected states", async () => {
		await createStates([
			["state-1", "To Do", 1000],
			["state-2", "To Do", 2000],
			["state-3", "To Do", 3000],
		]);

		const result = await core.reorderState({
			stateId: "state-3",
			targetStatus: "To Do",
			orderedStateIds: ["state-1", "state-3", "state-2"],
		});

		expect(result.updatedState.id).toBe("STATE-3");
		expect(result.updatedState.ordinal).toBeGreaterThan(1000);
		expect(result.updatedState.ordinal).toBeLessThan(2000);
		expect(result.changedStates.map((state) => state.id)).toEqual(["STATE-3"]);

		const state2 = await core.filesystem.loadState("state-2");
		expect(state2?.ordinal).toBe(2000);
	});

	it("rebalances ordinals when collisions exist", async () => {
		await createStates([
			["state-1", "To Do", 1000],
			["state-2", "To Do", 1000],
			["state-3", "To Do", 1000],
		]);

		const result = await core.reorderState({
			stateId: "state-3",
			targetStatus: "To Do",
			orderedStateIds: ["state-1", "state-3", "state-2"],
		});

		expect(result.changedStates.map((state) => state.id).sort()).toEqual(["STATE-2", "STATE-3"]);

		const state1 = await core.filesystem.loadState("state-1");
		const state2 = await core.filesystem.loadState("state-2");
		const state3 = await core.filesystem.loadState("state-3");
		expect(state1?.ordinal).toBe(1000);
		expect(state2?.ordinal).toBe(3000);
		expect(state3?.ordinal).toBe(2000);
	});

	it("updates status and ordinal when moving across columns", async () => {
		await createStates([
			["state-1", "To Do", 1000],
			["state-2", "In Progress", 1000],
			["state-3", "In Progress", 2000],
		]);

		const result = await core.reorderState({
			stateId: "state-1",
			targetStatus: "In Progress",
			orderedStateIds: ["state-1", "state-2", "state-3"],
		});

		expect(result.updatedState.status).toBe("In Progress");
		expect(result.updatedState.ordinal).toBeGreaterThan(0);
		expect(result.changedStates.map((state) => state.id)).toContain("STATE-1");

		const state2 = await core.filesystem.loadState("state-2");
		const state3 = await core.filesystem.loadState("state-3");
		expect(state2?.ordinal).toBe(1000);
		expect(state3?.ordinal).toBe(2000);
	});

	it("reorders states with legacy lowercase IDs", async () => {
		await createStates([
			["state-1", "To Do", 1000],
			["state-2", "To Do", 2000],
		]);

		const legacyState = buildState("state-3", "To Do", 3000);
		const legacyPath = join(core.filesystem.statesDir, "state-3 - Legacy State.md");
		await Bun.write(legacyPath, serializeState(legacyState));

		const result = await core.reorderState({
			stateId: "state-3",
			targetStatus: "To Do",
			orderedStateIds: ["state-1", "state-3", "state-2"],
		});

		expect(result.updatedState.id).toBe("STATE-3");
	});
});
