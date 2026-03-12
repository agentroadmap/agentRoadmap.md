import { describe, expect, it } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildKanbanStatusGroups, exportKanbanBoardToFile, generateMilestoneGroupedBoard } from "../board.ts";
import type { Milestone, State } from "../types/index.ts";

describe("exportKanbanBoardToFile", () => {
	it("creates file and overwrites board content", async () => {
		const dir = await mkdtemp(join(tmpdir(), "board-export-"));
		const file = join(dir, "README.md");
		const states: State[] = [
			{
				id: "state-1",
				title: "First",
				status: "To Do",
				assignee: [],
				createdDate: "",
				labels: [],
				dependencies: [],
			},
		];

		await exportKanbanBoardToFile(states, ["To Do"], file, "TestProject");
		const initial = await Bun.file(file).text();
		expect(initial).toContain("STATE-1");
		expect(initial).toContain("# Kanban Board Export (powered by Roadmap.md)");
		expect(initial).toContain("Project: TestProject");

		await exportKanbanBoardToFile(states, ["To Do"], file, "TestProject");
		const second = await Bun.file(file).text();
		const occurrences = second.split("STATE-1").length - 1;
		expect(occurrences).toBe(1); // Should overwrite, not append

		await rm(dir, { recursive: true, force: true });
	});

	it("sorts all columns by updatedDate descending, then by ID", async () => {
		const dir = await mkdtemp(join(tmpdir(), "board-export-"));
		const file = join(dir, "README.md");
		const states: State[] = [
			{
				id: "state-1",
				title: "First",
				status: "To Do",
				assignee: [],
				createdDate: "2025-01-01",
				updatedDate: "2025-01-08 10:00",
				labels: [],
				dependencies: [],
			},
			{
				id: "state-3",
				title: "Third",
				status: "To Do",
				assignee: [],
				createdDate: "2025-01-03",
				updatedDate: "2025-01-09 10:00",
				labels: [],
				dependencies: [],
			},
			{
				id: "state-2",
				title: "Second",
				status: "Done",
				assignee: [],
				createdDate: "2025-01-02",
				updatedDate: "2025-01-10 12:00",
				labels: [],
				dependencies: [],
			},
			{
				id: "state-4",
				title: "Fourth",
				status: "Done",
				assignee: [],
				createdDate: "2025-01-04",
				updatedDate: "2025-01-05 10:00",
				labels: [],
				dependencies: [],
			},
			{
				id: "state-5",
				title: "Fifth",
				status: "Done",
				assignee: [],
				createdDate: "2025-01-05",
				updatedDate: "2025-01-10 14:00",
				labels: [],
				dependencies: [],
			},
		];

		await exportKanbanBoardToFile(states, ["To Do", "Done"], file, "TestProject");
		const content = await Bun.file(file).text();

		// Split content into lines for easier testing
		const lines = content.split("\n");

		// Find rows containing our states (updated to match uppercase format)
		const state1Row = lines.find((line) => line.includes("STATE-1"));
		const state3Row = lines.find((line) => line.includes("STATE-3"));
		const state2Row = lines.find((line) => line.includes("STATE-2"));
		const state4Row = lines.find((line) => line.includes("STATE-4"));
		const state5Row = lines.find((line) => line.includes("STATE-5"));

		if (!state1Row || !state2Row || !state3Row || !state4Row || !state5Row) {
			throw new Error("Expected state rows not found in exported board content");
		}

		// Check that To Do states are ordered by updatedDate (state-3 has newer date than state-1)
		const state3Index = lines.indexOf(state3Row);
		const state1Index = lines.indexOf(state1Row);
		expect(state3Index).toBeLessThan(state1Index);

		// Check that Done states are ordered by updatedDate
		const state5Index = lines.indexOf(state5Row);
		const state2Index = lines.indexOf(state2Row);
		const state4Index = lines.indexOf(state4Row);
		expect(state5Index).toBeLessThan(state2Index); // state-5 before state-2
		expect(state2Index).toBeLessThan(state4Index); // state-2 before state-4

		await rm(dir, { recursive: true, force: true });
	});

	it("formats states with new styling rules", async () => {
		const dir = await mkdtemp(join(tmpdir(), "board-export-"));
		const file = join(dir, "README.md");
		const states: State[] = [
			{
				id: "state-204",
				title: "Test State",
				status: "To Do",
				assignee: ["alice", "bob"],
				createdDate: "2025-01-01",
				labels: ["enhancement", "ui"],
				dependencies: [],
			},
			{
				id: "state-205",
				title: "Substate Example",
				status: "To Do",
				assignee: [],
				createdDate: "2025-01-02",
				labels: [],
				dependencies: [],
				parentStateId: "state-204",
			},
		];

		await exportKanbanBoardToFile(states, ["To Do"], file, "TestProject");
		const content = await Bun.file(file).text();

		// Check uppercase state IDs
		expect(content).toContain("**STATE-204**");
		expect(content).toContain("└─ **STATE-205**");

		// Check assignee formatting with @ prefix
		expect(content).toContain("[@alice, @bob]");

		// Check label formatting with # prefix and italics
		expect(content).toContain("*#enhancement #ui*");

		// Check that states without assignees/labels don't have empty brackets
		expect(content).not.toContain("[]");
		expect(content).not.toContain("**STATE-205** - Substate Example<br>");

		await rm(dir, { recursive: true, force: true });
	});

	it("handles assignees with existing @ symbols correctly", async () => {
		const dir = await mkdtemp(join(tmpdir(), "board-export-"));
		const file = join(dir, "README.md");
		const states: State[] = [
			{
				id: "state-100",
				title: "Test @ Handling",
				status: "To Do",
				assignee: ["@claude", "alice", "@bob"],
				createdDate: "2025-01-01",
				labels: [],
				dependencies: [],
			},
		];

		await exportKanbanBoardToFile(states, ["To Do"], file, "TestProject");
		const content = await Bun.file(file).text();

		// Check that we don't get double @ symbols
		expect(content).toContain("[@claude, @alice, @bob]");
		expect(content).not.toContain("@@claude");
		expect(content).not.toContain("@@bob");

		await rm(dir, { recursive: true, force: true });
	});
});

describe("buildKanbanStatusGroups", () => {
	it("returns configured statuses even when there are no states", () => {
		const { orderedStatuses, groupedStates } = buildKanbanStatusGroups([], ["To Do", "In Progress", "Done"]);
		expect(orderedStatuses).toEqual(["To Do", "In Progress", "Done"]);
		expect(groupedStates.get("To Do")).toEqual([]);
		expect(groupedStates.get("In Progress")).toEqual([]);
		expect(groupedStates.get("Done")).toEqual([]);
	});

	it("appends unknown statuses from states after configured ones", () => {
		const states: State[] = [
			{
				id: "state-1",
				title: "Blocked State",
				status: "Blocked",
				assignee: [],
				createdDate: "2025-01-02",
				labels: [],
				dependencies: [],
			},
			{
				id: "state-2",
				title: "Lowercase todo",
				status: "to do",
				assignee: [],
				createdDate: "2025-01-03",
				labels: [],
				dependencies: [],
			},
		];

		const { orderedStatuses, groupedStates } = buildKanbanStatusGroups(states, ["To Do"]);
		expect(orderedStatuses).toEqual(["To Do", "Blocked"]);
		expect(groupedStates.get("To Do")?.map((t) => t.id)).toEqual(["state-2"]);
		expect(groupedStates.get("Blocked")?.map((t) => t.id)).toEqual(["state-1"]);
	});
});

describe("generateMilestoneGroupedBoard", () => {
	it("groups milestone ID and title aliases into one section using file title", () => {
		const states: State[] = [
			{
				id: "state-1",
				title: "By ID",
				status: "To Do",
				assignee: [],
				createdDate: "2026-01-01",
				labels: [],
				dependencies: [],
				milestone: "m-0",
			},
			{
				id: "state-2",
				title: "By title",
				status: "To Do",
				assignee: [],
				createdDate: "2026-01-01",
				labels: [],
				dependencies: [],
				milestone: "Release 1.0",
			},
		];
		const milestones: Milestone[] = [
			{
				id: "m-0",
				title: "Release 1.0",
				description: "Milestone: Release 1.0",
				rawContent: "## Description\n\nMilestone: Release 1.0",
			},
		];

		const board = generateMilestoneGroupedBoard(states, ["To Do"], milestones, "Test Project");
		expect(board.match(/## Release 1\.0 \(\d+ states\)/g)?.length).toBe(1);
		expect(board).toContain("**STATE-1** - By ID");
		expect(board).toContain("**STATE-2** - By title");
	});

	it("keeps ambiguous reused milestone titles as separate sections", () => {
		const states: State[] = [
			{
				id: "state-1",
				title: "Active by ID",
				status: "To Do",
				assignee: [],
				createdDate: "2026-01-01",
				labels: [],
				dependencies: [],
				milestone: "m-2",
			},
			{
				id: "state-2",
				title: "Title alias",
				status: "To Do",
				assignee: [],
				createdDate: "2026-01-01",
				labels: [],
				dependencies: [],
				milestone: "Shared",
			},
		];
		const milestones: Milestone[] = [
			{
				id: "m-2",
				title: "Shared",
				description: "Milestone: Shared",
				rawContent: "## Description\n\nMilestone: Shared",
			},
			{
				id: "m-0",
				title: "Shared",
				description: "Milestone: Shared (archived)",
				rawContent: "## Description\n\nMilestone: Shared (archived)",
			},
		];

		const board = generateMilestoneGroupedBoard(states, ["To Do"], milestones, "Test Project");
		expect(board.match(/## Shared \(\d+ states\)/g)?.length).toBe(2);
	});
});
