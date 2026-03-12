import { describe, expect, it } from "bun:test";
import { computeSequences } from "../core/sequences.ts";
import type { State } from "../types/index.ts";

function state(id: string, deps: string[] = []): State {
	return {
		id,
		title: id,
		status: "To Do",
		assignee: [],
		createdDate: "2025-01-01",
		labels: [],
		dependencies: deps,
		description: "Test",
	};
}

describe("computeSequences (with Unsequenced)", () => {
	function mustGet<T>(arr: T[], idx: number): T {
		const v = arr[idx];
		if (v === undefined) throw new Error(`expected element at index ${idx}`);
		return v;
	}
	it("puts isolated states into Unsequenced bucket", () => {
		const states = [state("state-1"), state("state-2"), state("state-3")];
		const res = computeSequences(states);
		expect(res.sequences.length).toBe(0);
		expect(res.unsequenced.map((t) => t.id)).toEqual(["state-1", "state-2", "state-3"]);
	});

	it("handles a simple chain A -> B -> C", () => {
		const states = [state("state-1"), state("state-2", ["state-1"]), state("state-3", ["state-2"])];
		const res = computeSequences(states);
		expect(res.sequences.length).toBe(3);
		expect(mustGet(res.sequences, 0).states.map((t) => t.id)).toEqual(["state-1"]);
		expect(mustGet(res.sequences, 1).states.map((t) => t.id)).toEqual(["state-2"]);
		expect(mustGet(res.sequences, 2).states.map((t) => t.id)).toEqual(["state-3"]);
	});

	it("groups parallel branches (A -> C, B -> C) into same sequence", () => {
		const states = [state("state-1"), state("state-2"), state("state-3", ["state-1", "state-2"])];
		const res = computeSequences(states);
		expect(res.sequences.length).toBe(2);
		// First layer contains 1 and 2 in id order
		expect(mustGet(res.sequences, 0).states.map((t) => t.id)).toEqual(["state-1", "state-2"]);
		// Second layer contains 3
		expect(mustGet(res.sequences, 1).states.map((t) => t.id)).toEqual(["state-3"]);
	});

	it("handles a more complex graph", () => {
		// 1,2 -> 4 ; 3 -> 5 -> 6
		const states = [
			state("state-1"),
			state("state-2"),
			state("state-3"),
			state("state-4", ["state-1", "state-2"]),
			state("state-5", ["state-3"]),
			state("state-6", ["state-5"]),
		];
		const res = computeSequences(states);
		expect(res.sequences.length).toBe(3);
		expect(mustGet(res.sequences, 0).states.map((t) => t.id)).toEqual(["state-1", "state-2", "state-3"]);
		// Second layer should include 4 and 5 (order by id)
		expect(mustGet(res.sequences, 1).states.map((t) => t.id)).toEqual(["state-4", "state-5"]);
		// Final layer 6
		expect(mustGet(res.sequences, 2).states.map((t) => t.id)).toEqual(["state-6"]);
	});

	it("ignores external dependencies not present in the state set", () => {
		const states = [state("state-1", ["state-999"])];
		const res = computeSequences(states);
		expect(res.sequences.length).toBe(1);
		expect(mustGet(res.sequences, 0).states.map((t) => t.id)).toEqual(["state-1"]);
	});
});
