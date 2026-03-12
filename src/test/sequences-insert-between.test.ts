import { describe, expect, it } from "bun:test";
import { adjustDependenciesForInsertBetween, computeSequences } from "../core/sequences.ts";
import type { State } from "../types/index.ts";

function t(id: string, deps: string[] = []): State {
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

describe("adjustDependenciesForInsertBetween", () => {
	it("creates new sequence between K and K+1 with dependency updates", () => {
		// seq1: 1,2 ; seq2: 3(dep:1,2) ; seq3: 4(dep:3), 5(dep:3)
		const states = [
			t("state-1"),
			t("state-2"),
			t("state-3", ["state-1", "state-2"]),
			t("state-4", ["state-3"]),
			t("state-5", ["state-3"]),
		];
		const res = computeSequences(states);
		expect(res.sequences.length).toBe(3);
		// Drop state-5 between seq1 (K=1) and seq2 (K+1)
		const updated = adjustDependenciesForInsertBetween(states, res.sequences, "state-5", 1);
		const next = computeSequences(updated);
		// Expect: seq1: 1,2 ; seq2: 5 ; seq3: 3 ; seq4: 4
		expect(next.sequences.length).toBe(4);
		expect(next.sequences[0]?.states.map((x) => x.id)).toEqual(["state-1", "state-2"]);
		expect(next.sequences[1]?.states.map((x) => x.id)).toEqual(["state-5"]);
		expect(next.sequences[2]?.states.map((x) => x.id)).toEqual(["state-3"]);
		expect(next.sequences[3]?.states.map((x) => x.id)).toEqual(["state-4"]);
	});

	it("supports top insertion (K=0): moved becomes Sequence 1; next sequence states depend on moved", () => {
		// seq1: 1 ; seq2: 2(dep:1)
		const states = [t("state-1"), t("state-2", ["state-1"]), t("state-3")];
		const res = computeSequences(states);
		expect(res.sequences.length).toBe(2);
		const updated = adjustDependenciesForInsertBetween(states, res.sequences, "state-3", 0);
		const next = computeSequences(updated);
		// Expect: seq1: 3 ; seq2: 1 ; seq3: 2
		expect(next.sequences.length).toBe(3);
		expect(next.sequences[0]?.states.map((x) => x.id)).toEqual(["state-3"]);
		expect(next.sequences[1]?.states.map((x) => x.id)).toEqual(["state-1"]);
		expect(next.sequences[2]?.states.map((x) => x.id)).toEqual(["state-2"]);
	});

	it("when there are no sequences, top insertion anchors moved via ordinal", () => {
		// All states unsequenced initially (no deps, no dependents)
		const states = [t("state-1"), t("state-2")];
		const res = computeSequences(states);
		expect(res.sequences.length).toBe(0);
		const updated = adjustDependenciesForInsertBetween(states, res.sequences, "state-2", 0);
		const byId = new Map(updated.map((x) => [x.id, x]));
		// moved has ordinal set
		expect(byId.get("state-2")?.ordinal).toBe(0);
		const next = computeSequences(updated);
		expect(next.sequences.length).toBe(1);
		expect(next.sequences[0]?.states.map((x) => x.id)).toEqual(["state-2"]);
	});
});
