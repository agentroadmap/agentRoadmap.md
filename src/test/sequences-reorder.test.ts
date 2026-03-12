import { describe, expect, it } from "bun:test";
import { reorderWithinSequence } from "../core/sequences.ts";
import type { State } from "../types/index.ts";

function t(id: string, ordinal?: number): State {
	return {
		id,
		title: id,
		status: "To Do",
		assignee: [],
		createdDate: "2025-01-01",
		labels: [],
		dependencies: [],
		rawContent: "Test",
		...(ordinal !== undefined ? { ordinal } : {}),
	};
}

describe("reorderWithinSequence", () => {
	it("reassigns ordinals within a sequence and leaves others untouched", () => {
		const states: State[] = [
			t("state-1", 0),
			t("state-2", 1),
			t("state-3", 2),
			t("state-9"), // outside this sequence
		];
		const updated = reorderWithinSequence(states, ["state-1", "state-2", "state-3"], "state-3", 0);
		const byId = new Map(updated.map((x) => [x.id, x]));
		expect(byId.get("state-3")?.ordinal).toBe(0);
		expect(byId.get("state-1")?.ordinal).toBe(1);
		expect(byId.get("state-2")?.ordinal).toBe(2);
		expect(byId.get("state-9")?.ordinal).toBeUndefined();
	});

	it("clamps index and preserves dependencies", () => {
		const states: State[] = [{ ...t("state-1", 0), dependencies: ["state-x"] }, t("state-2", 1)];
		const updated = reorderWithinSequence(states, ["state-1", "state-2"], "state-1", 10);
		const byId = new Map(updated.map((x) => [x.id, x]));
		expect(byId.get("state-1")?.ordinal).toBe(1);
		expect(byId.get("state-1")?.dependencies).toEqual(["state-x"]);
	});
});
