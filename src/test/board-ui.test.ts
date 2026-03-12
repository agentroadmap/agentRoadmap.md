import { describe, expect, it } from "bun:test";
import type { State } from "../types/index.ts";
import type { ColumnData } from "../ui/board.ts";
import { shouldRebuildColumns } from "../ui/board.ts";

// Helper to create a minimal valid State for testing
const createTestState = (id: string, title: string, status: string): State => ({
	id,
	title,
	status,
	assignee: [],
	createdDate: "2025-01-01",
	labels: [],
	dependencies: [],
});

describe("Board TUI Logic", () => {
	describe("shouldRebuildColumns", () => {
		it("should return true if column counts differ", () => {
			const current: ColumnData[] = [{ status: "ToDo", states: [] }];
			const next: ColumnData[] = [
				{ status: "ToDo", states: [] },
				{ status: "Done", states: [] },
			];
			expect(shouldRebuildColumns(current, next)).toBe(true);
		});

		it("should return true if statuses differ", () => {
			const current: ColumnData[] = [{ status: "ToDo", states: [] }];
			const next: ColumnData[] = [{ status: "Done", states: [] }];
			expect(shouldRebuildColumns(current, next)).toBe(true);
		});

		it("should return true if state counts differ", () => {
			const state1 = createTestState("1", "t1", "ToDo");
			const current: ColumnData[] = [{ status: "ToDo", states: [state1] }];
			const next: ColumnData[] = [{ status: "ToDo", states: [] }];
			expect(shouldRebuildColumns(current, next)).toBe(true);
		});

		it("should return true if state IDs differ (order change)", () => {
			const state1 = createTestState("1", "t1", "ToDo");
			const state2 = createTestState("2", "t2", "ToDo");

			const current: ColumnData[] = [{ status: "ToDo", states: [state1, state2] }];
			const next: ColumnData[] = [{ status: "ToDo", states: [state2, state1] }];
			expect(shouldRebuildColumns(current, next)).toBe(true);
		});

		it("should return false if columns and states are identical", () => {
			const state1 = createTestState("1", "t1", "ToDo");
			const state2 = createTestState("2", "t2", "ToDo");

			const current: ColumnData[] = [{ status: "ToDo", states: [state1, state2] }];
			const next: ColumnData[] = [{ status: "ToDo", states: [state1, state2] }];
			expect(shouldRebuildColumns(current, next)).toBe(false);
		});
	});
});
