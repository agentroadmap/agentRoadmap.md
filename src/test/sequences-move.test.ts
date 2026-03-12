import { describe, expect, it } from "bun:test";
import { adjustDependenciesForMove, computeSequences } from "../core/sequences.ts";
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

describe("adjustDependenciesForMove (join semantics)", () => {
	it("sets moved state deps to previous sequence states and does not modify next sequence", () => {
		// seq1: 1,2 ; seq2: 3(dep:1,2) ; seq3: 4(dep:3)
		const states = [t("state-1"), t("state-2"), t("state-3", ["state-1", "state-2"]), t("state-4", ["state-3"])];
		const res = computeSequences(states);
		const seqs = res.sequences;

		// Move state-3 to sequence 1 (target index = 1)
		const updated = adjustDependenciesForMove(states, seqs, "state-3", 1);
		const byId = new Map(updated.map((x) => [x.id, x]));

		// Moved deps should be from previous sequence (none)
		expect(byId.get("state-3")?.dependencies).toEqual([]);

		// Next sequence unchanged (no forced dependency to moved)
		expect(byId.get("state-4")?.dependencies).toEqual(["state-3"]);
	});

	it("keeps deps and does not add duplicates to next sequence", () => {
		// seq1: 1 ; seq2: 2(dep:1), 3(dep:1) ; seq3: 4(dep:2,3)
		const states = [t("state-1"), t("state-2", ["state-1"]), t("state-3", ["state-1"]), t("state-4", ["state-2", "state-3"])];
		const res = computeSequences(states);
		const seqs = res.sequences;

		// Move state-2 to seq2 (target=2) -> prev seq = seq1 -> deps should be [state-1]
		const updated = adjustDependenciesForMove(states, seqs, "state-2", 2);
		const byId = new Map(updated.map((x) => [x.id, x]));
		expect(byId.get("state-2")?.dependencies).toEqual(["state-1"]);
		// state-4 unchanged
		expect(byId.get("state-4")?.dependencies).toEqual(["state-2", "state-3"]);
	});
});
