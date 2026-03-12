import { describe, expect, it } from "bun:test";
import { canMoveToUnsequenced } from "../core/sequences.ts";
import type { State } from "../types/index.ts";

function t(id: string, deps: string[] = [], extra: Partial<State> = {}): State {
	return {
		id,
		title: id,
		status: "To Do",
		assignee: [],
		createdDate: "2025-01-01",
		labels: [],
		dependencies: deps,
		rawContent: "Test",
		...extra,
	};
}

describe("canMoveToUnsequenced", () => {
	it("returns true for isolated states (no deps, no dependents)", () => {
		const states = [t("state-1"), t("state-2")];
		expect(canMoveToUnsequenced(states, "state-2")).toBe(true);
	});

	it("returns false when state has dependencies", () => {
		const states = [t("state-1"), t("state-2", ["state-1"])];
		expect(canMoveToUnsequenced(states, "state-2")).toBe(false);
	});

	it("returns false when state has dependents", () => {
		const states = [t("state-1"), t("state-2", ["state-1"])];
		expect(canMoveToUnsequenced(states, "state-1")).toBe(false);
	});
});
