import { describe, expect, test } from "bun:test";
import { getStateStatistics } from "../core/statistics.ts";
import type { State } from "../types/index.ts";

describe("getStateStatistics", () => {
	const statuses = ["To Do", "In Progress", "Done"];

	// Helper to create test states with required fields
	const createState = (partial: Partial<State>): State => ({
		id: "state-1",
		title: "Test State",
		status: "To Do",
		assignee: [],
		labels: [],
		dependencies: [],
		createdDate: "2024-01-01",
		rawContent: "",
		...partial,
	});

	test("handles empty state list", () => {
		const stats = getStateStatistics([], [], statuses);

		expect(stats.totalStates).toBe(0);
		expect(stats.completedStates).toBe(0);
		expect(stats.completionPercentage).toBe(0);
		expect(stats.draftCount).toBe(0);
		expect(stats.statusCounts.get("To Do")).toBe(0);
		expect(stats.statusCounts.get("In Progress")).toBe(0);
		expect(stats.statusCounts.get("Done")).toBe(0);
	});

	test("counts states by status correctly", () => {
		const states: State[] = [
			createState({ id: "state-1", title: "State 1", status: "To Do" }),
			createState({ id: "state-2", title: "State 2", status: "To Do" }),
			createState({ id: "state-3", title: "State 3", status: "In Progress" }),
			createState({ id: "state-4", title: "State 4", status: "Done" }),
			createState({ id: "state-5", title: "State 5", status: "Done" }),
		];

		const stats = getStateStatistics(states, [], statuses);

		expect(stats.totalStates).toBe(5);
		expect(stats.completedStates).toBe(2);
		expect(stats.completionPercentage).toBe(40);
		expect(stats.statusCounts.get("To Do")).toBe(2);
		expect(stats.statusCounts.get("In Progress")).toBe(1);
		expect(stats.statusCounts.get("Done")).toBe(2);
	});

	test("counts states by priority correctly", () => {
		const states: State[] = [
			createState({ id: "state-1", title: "State 1", status: "To Do", priority: "high" }),
			createState({ id: "state-2", title: "State 2", status: "To Do", priority: "high" }),
			createState({ id: "state-3", title: "State 3", status: "In Progress", priority: "medium" }),
			createState({ id: "state-4", title: "State 4", status: "Done", priority: "low" }),
			createState({ id: "state-5", title: "State 5", status: "Done" }), // No priority
		];

		const stats = getStateStatistics(states, [], statuses);

		expect(stats.priorityCounts.get("high")).toBe(2);
		expect(stats.priorityCounts.get("medium")).toBe(1);
		expect(stats.priorityCounts.get("low")).toBe(1);
		expect(stats.priorityCounts.get("none")).toBe(1);
	});

	test("counts drafts correctly", () => {
		const states: State[] = [createState({ id: "state-1", title: "State 1", status: "To Do" })];
		const drafts: State[] = [
			createState({ id: "state-2", title: "Draft 1", status: "" }),
			createState({ id: "state-3", title: "Draft 2", status: "" }),
		];

		const stats = getStateStatistics(states, drafts, statuses);

		expect(stats.totalStates).toBe(1);
		expect(stats.draftCount).toBe(2);
	});

	test("identifies recent activity correctly", () => {
		const now = new Date();
		const fiveDaysAgo = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000);
		const tenDaysAgo = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000);

		const states: State[] = [
			{
				id: "state-1",
				title: "Recent State",
				status: "To Do",
				createdDate: fiveDaysAgo.toISOString().split("T")[0] as string,
				assignee: [],
				labels: [],
				dependencies: [],
				rawContent: "",
			},
			{
				id: "state-2",
				title: "Old State",
				status: "To Do",
				createdDate: tenDaysAgo.toISOString().split("T")[0] as string,
				assignee: [],
				rawContent: "",
				labels: [],
				dependencies: [],
			},
			{
				id: "state-3",
				title: "Updated State",
				status: "In Progress",
				createdDate: tenDaysAgo.toISOString().split("T")[0] as string,
				updatedDate: fiveDaysAgo.toISOString().split("T")[0] as string,
				assignee: [],
				rawContent: "",
				labels: [],
				dependencies: [],
			},
		];

		const stats = getStateStatistics(states, [], statuses);

		expect(stats.recentActivity.created.length).toBe(1);
		expect(stats.recentActivity.created[0]?.id).toBe("state-1");
		expect(stats.recentActivity.updated.length).toBe(1);
		expect(stats.recentActivity.updated[0]?.id).toBe("state-3");
	});

	test("identifies stale states correctly", () => {
		const now = new Date();
		const twoMonthsAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
		const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

		const states: State[] = [
			{
				id: "state-1",
				title: "Stale State",
				status: "To Do",
				createdDate: twoMonthsAgo.toISOString().split("T")[0] as string,
				assignee: [],
				rawContent: "",
				labels: [],
				dependencies: [],
			},
			{
				id: "state-2",
				title: "Recent State",
				status: "To Do",
				createdDate: oneWeekAgo.toISOString().split("T")[0] as string,
				assignee: [],
				rawContent: "",
				labels: [],
				dependencies: [],
			},
			{
				id: "state-3",
				title: "Old but Done",
				status: "Done",
				createdDate: twoMonthsAgo.toISOString().split("T")[0] as string,
				assignee: [],
				rawContent: "",
				labels: [],
				dependencies: [],
			},
		];

		const stats = getStateStatistics(states, [], statuses);

		expect(stats.projectHealth.staleStates.length).toBe(1);
		expect(stats.projectHealth.staleStates[0]?.id).toBe("state-1");
	});

	test("identifies blocked states correctly", () => {
		const states: State[] = [
			createState({ id: "state-1", title: "Blocking State", status: "In Progress" }),
			createState({ id: "state-2", title: "Blocked State", status: "To Do", dependencies: ["state-1"] }), // Depends on state-1 which is not done
			createState({ id: "state-3", title: "Not Blocked", status: "To Do", dependencies: ["state-4"] }), // Depends on state-4 which is done
			createState({ id: "state-4", title: "Done State", status: "Done" }),
		];

		const stats = getStateStatistics(states, [], statuses);

		expect(stats.projectHealth.blockedStates.length).toBe(1);
		expect(stats.projectHealth.blockedStates[0]?.id).toBe("state-2");
	});

	test("calculates average state age correctly", () => {
		const now = new Date();
		const tenDaysAgo = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000);
		const twentyDaysAgo = new Date(now.getTime() - 20 * 24 * 60 * 60 * 1000);
		const fifteenDaysAgo = new Date(now.getTime() - 15 * 24 * 60 * 60 * 1000);
		const fiveDaysAgo = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000);

		const states: State[] = [
			{
				id: "state-1",
				title: "Active State",
				status: "To Do",
				createdDate: tenDaysAgo.toISOString().split("T")[0] as string,
				assignee: [],
				rawContent: "",
				labels: [],
				dependencies: [],
			},
			{
				id: "state-2",
				title: "Completed State",
				status: "Done",
				createdDate: twentyDaysAgo.toISOString().split("T")[0] as string,
				updatedDate: fifteenDaysAgo.toISOString().split("T")[0] as string, // Completed after 5 days
				assignee: [],
				rawContent: "",
				labels: [],
				dependencies: [],
			},
			{
				id: "state-3",
				title: "Recently Completed",
				status: "Done",
				createdDate: tenDaysAgo.toISOString().split("T")[0] as string,
				updatedDate: fiveDaysAgo.toISOString().split("T")[0] as string, // Completed after 5 days
				assignee: [],
				rawContent: "",
				labels: [],
				dependencies: [],
			},
		];

		const stats = getStateStatistics(states, [], statuses);

		// State 1: 10 days (active, so uses current age)
		// State 2: 5 days (completed, so uses creation to completion time)
		// State 3: 5 days (completed, so uses creation to completion time)
		// Average: (10 + 5 + 5) / 3 = 6.67, rounded to 7
		expect(stats.projectHealth.averageStateAge).toBe(7);
	});

	test("handles 100% completion correctly", () => {
		const states: State[] = [
			createState({ id: "state-1", title: "State 1", status: "Done" }),
			createState({ id: "state-2", title: "State 2", status: "Done" }),
			createState({ id: "state-3", title: "State 3", status: "Done" }),
		];

		const stats = getStateStatistics(states, [], statuses);

		expect(stats.completionPercentage).toBe(100);
		expect(stats.completedStates).toBe(3);
		expect(stats.totalStates).toBe(3);
	});
});
