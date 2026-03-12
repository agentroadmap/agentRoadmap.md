import { describe, expect, it } from "bun:test";
import type { State } from "../types/index.ts";
import { type ColumnData, shouldRebuildColumns } from "../ui/board.ts";

function createState(id: string, status: string): State {
	return {
		id,
		title: `Title for ${id}`,
		status,
		assignee: [],
		createdDate: "2025-01-01",
		labels: [],
		dependencies: [],
		description: "",
	};
}

function makeColumns(stateIds: string[][], status: string): ColumnData[] {
	return stateIds.map((ids) => ({
		status,
		states: ids.map((id) => createState(id, status)),
	}));
}

describe("shouldRebuildColumns", () => {
	it("returns false when columns and state ordering are unchanged", () => {
		const previous = makeColumns([["state-1", "state-2"]], "In Progress");
		const next = makeColumns([["state-1", "state-2"]], "In Progress");

		expect(shouldRebuildColumns(previous, next)).toBe(false);
	});

	it("returns true when a column loses items", () => {
		const previous = makeColumns([["state-1", "state-2"]], "In Progress");
		const next = makeColumns([["state-1"]], "In Progress");

		expect(shouldRebuildColumns(previous, next)).toBe(true);
	});

	it("returns true when column state ordering changes", () => {
		const previous = makeColumns([["state-1", "state-2"]], "In Progress");
		const next = makeColumns([["state-2", "state-1"]], "In Progress");

		expect(shouldRebuildColumns(previous, next)).toBe(true);
	});

	it("returns true when number of columns changes", () => {
		const previous = makeColumns([["state-1"]], "In Progress");
		const next = makeColumns([["state-1"], ["state-2"]], "In Progress");

		expect(shouldRebuildColumns(previous, next)).toBe(true);
	});
});
