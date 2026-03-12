import { describe, expect, test } from "bun:test";
import { compareStateIds, parseStateId, sortByPriority, sortByStateId, sortStates } from "../utils/state-sorting.ts";

describe("parseStateId", () => {
	test("parses simple state IDs", () => {
		expect(parseStateId("state-1")).toEqual([1]);
		expect(parseStateId("state-10")).toEqual([10]);
		expect(parseStateId("state-100")).toEqual([100]);
	});

	test("parses decimal state IDs", () => {
		expect(parseStateId("state-1.1")).toEqual([1, 1]);
		expect(parseStateId("state-1.2.3")).toEqual([1, 2, 3]);
		expect(parseStateId("state-10.20.30")).toEqual([10, 20, 30]);
	});

	test("handles IDs without state- prefix", () => {
		expect(parseStateId("5")).toEqual([5]);
		expect(parseStateId("5.1")).toEqual([5, 1]);
	});

	test("handles invalid numeric parts", () => {
		expect(parseStateId("state-abc")).toEqual([0]);
		expect(parseStateId("state-1.abc.2")).toEqual([2]); // Mixed numeric/non-numeric extracts trailing number
	});

	test("handles IDs with trailing numbers", () => {
		expect(parseStateId("state-draft")).toEqual([0]);
		expect(parseStateId("state-draft2")).toEqual([2]);
		expect(parseStateId("state-draft10")).toEqual([10]);
		expect(parseStateId("draft2")).toEqual([2]);
		expect(parseStateId("abc123")).toEqual([123]);
	});
});

describe("compareStateIds", () => {
	test("sorts simple state IDs numerically", () => {
		expect(compareStateIds("state-2", "state-10")).toBeLessThan(0);
		expect(compareStateIds("state-10", "state-2")).toBeGreaterThan(0);
		expect(compareStateIds("state-5", "state-5")).toBe(0);
	});

	test("sorts decimal state IDs correctly", () => {
		expect(compareStateIds("state-2.1", "state-2.2")).toBeLessThan(0);
		expect(compareStateIds("state-2.2", "state-2.10")).toBeLessThan(0);
		expect(compareStateIds("state-2.10", "state-2.2")).toBeGreaterThan(0);
	});

	test("parent states come before substates", () => {
		expect(compareStateIds("state-2", "state-2.1")).toBeLessThan(0);
		expect(compareStateIds("state-2.1", "state-2")).toBeGreaterThan(0);
	});

	test("handles different depth levels", () => {
		expect(compareStateIds("state-1.1.1", "state-1.2")).toBeLessThan(0);
		expect(compareStateIds("state-1.2", "state-1.1.1")).toBeGreaterThan(0);
	});

	test("sorts IDs with trailing numbers", () => {
		expect(compareStateIds("state-draft", "state-draft2")).toBeLessThan(0);
		expect(compareStateIds("state-draft2", "state-draft10")).toBeLessThan(0);
		expect(compareStateIds("state-draft10", "state-draft2")).toBeGreaterThan(0);
	});
});

describe("sortByStateId", () => {
	test("sorts array of states by ID numerically", () => {
		const states = [
			{ id: "state-10", title: "State 10" },
			{ id: "state-2", title: "State 2" },
			{ id: "state-1", title: "State 1" },
			{ id: "state-20", title: "State 20" },
			{ id: "state-3", title: "State 3" },
		];

		const sorted = sortByStateId(states);
		expect(sorted.map((t) => t.id)).toEqual(["state-1", "state-2", "state-3", "state-10", "state-20"]);
	});

	test("sorts states with decimal IDs correctly", () => {
		const states = [
			{ id: "state-2.10", title: "Substate 2.10" },
			{ id: "state-2.2", title: "Substate 2.2" },
			{ id: "state-2", title: "State 2" },
			{ id: "state-1", title: "State 1" },
			{ id: "state-2.1", title: "Substate 2.1" },
		];

		const sorted = sortByStateId(states);
		expect(sorted.map((t) => t.id)).toEqual(["state-1", "state-2", "state-2.1", "state-2.2", "state-2.10"]);
	});

	test("handles mixed simple and decimal IDs", () => {
		const states = [
			{ id: "state-10", title: "State 10" },
			{ id: "state-2.1", title: "Substate 2.1" },
			{ id: "state-2", title: "State 2" },
			{ id: "state-1", title: "State 1" },
			{ id: "state-10.1", title: "Substate 10.1" },
			{ id: "state-3", title: "State 3" },
		];

		const sorted = sortByStateId(states);
		expect(sorted.map((t) => t.id)).toEqual(["state-1", "state-2", "state-2.1", "state-3", "state-10", "state-10.1"]);
	});

	test("preserves original array", () => {
		const states = [
			{ id: "state-3", title: "State 3" },
			{ id: "state-1", title: "State 1" },
			{ id: "state-2", title: "State 2" },
		];

		const original = [...states];
		sortByStateId(states);

		// Original array order should be preserved
		expect(states).toEqual(original);
	});
});

describe("sortByPriority", () => {
	test("sorts states by priority order: high > medium > low > undefined", () => {
		const states = [
			{ id: "state-1", priority: "low" as const },
			{ id: "state-2", priority: "high" as const },
			{ id: "state-3" }, // no priority
			{ id: "state-4", priority: "medium" as const },
			{ id: "state-5", priority: "high" as const },
		];

		const sorted = sortByPriority(states);
		expect(sorted.map((t) => ({ id: t.id, priority: t.priority }))).toEqual([
			{ id: "state-2", priority: "high" },
			{ id: "state-5", priority: "high" },
			{ id: "state-4", priority: "medium" },
			{ id: "state-1", priority: "low" },
			{ id: "state-3", priority: undefined },
		]);
	});

	test("sorts states with same priority by state ID", () => {
		const states = [
			{ id: "state-10", priority: "high" as const },
			{ id: "state-2", priority: "high" as const },
			{ id: "state-20", priority: "medium" as const },
			{ id: "state-1", priority: "medium" as const },
		];

		const sorted = sortByPriority(states);
		expect(sorted.map((t) => t.id)).toEqual(["state-2", "state-10", "state-1", "state-20"]);
	});

	test("handles all undefined priorities", () => {
		const states = [{ id: "state-3" }, { id: "state-1" }, { id: "state-2" }];

		const sorted = sortByPriority(states);
		expect(sorted.map((t) => t.id)).toEqual(["state-1", "state-2", "state-3"]);
	});

	test("preserves original array", () => {
		const states = [
			{ id: "state-1", priority: "low" as const },
			{ id: "state-2", priority: "high" as const },
		];

		const original = [...states];
		sortByPriority(states);

		// Original array order should be preserved
		expect(states).toEqual(original);
	});
});

describe("sortStates", () => {
	test("sorts by priority when field is 'priority'", () => {
		const states = [
			{ id: "state-1", priority: "low" as const },
			{ id: "state-2", priority: "high" as const },
			{ id: "state-3", priority: "medium" as const },
		];

		const sorted = sortStates(states, "priority");
		expect(sorted.map((t) => t.priority)).toEqual(["high", "medium", "low"]);
	});

	test("sorts by ID when field is 'id'", () => {
		const states = [
			{ id: "state-10", priority: "high" as const },
			{ id: "state-2", priority: "high" as const },
			{ id: "state-1", priority: "high" as const },
		];

		const sorted = sortStates(states, "id");
		expect(sorted.map((t) => t.id)).toEqual(["state-1", "state-2", "state-10"]);
	});

	test("handles case-insensitive field names", () => {
		const states = [
			{ id: "state-1", priority: "low" as const },
			{ id: "state-2", priority: "high" as const },
		];

		const sorted = sortStates(states, "PRIORITY");
		expect(sorted.map((t) => t.priority)).toEqual(["high", "low"]);
	});

	test("defaults to ID sorting for unknown fields", () => {
		const states = [{ id: "state-10" }, { id: "state-2" }, { id: "state-1" }];

		const sorted = sortStates(states, "unknown");
		expect(sorted.map((t) => t.id)).toEqual(["state-1", "state-2", "state-10"]);
	});

	test("defaults to ID sorting for empty field", () => {
		const states = [{ id: "state-10" }, { id: "state-2" }];

		const sorted = sortStates(states, "");
		expect(sorted.map((t) => t.id)).toEqual(["state-2", "state-10"]);
	});
});
