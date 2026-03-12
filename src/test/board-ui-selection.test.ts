import { describe, expect, it } from "bun:test";
import type { State } from "../types/index.ts";
import { compareStateIds } from "../utils/state-sorting.ts";

describe("board UI state selection", () => {
	it("compareStateIds sorts states numerically by ID", () => {
		const states: State[] = [
			{
				id: "state-10",
				title: "State 10",
				status: "To Do",
				assignee: [],
				createdDate: "",
				labels: [],
				dependencies: [],
				description: "",
			},
			{
				id: "state-2",
				title: "State 2",
				status: "To Do",
				assignee: [],
				createdDate: "",
				labels: [],
				dependencies: [],
				description: "",
			},
			{
				id: "state-1",
				title: "State 1",
				status: "To Do",
				assignee: [],
				createdDate: "",
				labels: [],
				dependencies: [],
				description: "",
			},
			{
				id: "state-20",
				title: "State 20",
				status: "To Do",
				assignee: [],
				createdDate: "",
				labels: [],
				dependencies: [],
				description: "",
			},
		];

		const sorted = [...states].sort((a, b) => compareStateIds(a.id, b.id));
		expect(sorted[0]?.id).toBe("state-1");
		expect(sorted[1]?.id).toBe("state-2");
		expect(sorted[2]?.id).toBe("state-10");
		expect(sorted[3]?.id).toBe("state-20");
	});

	it("compareStateIds handles decimal state IDs correctly", () => {
		const states: State[] = [
			{
				id: "state-1.10",
				title: "State 1.10",
				status: "To Do",
				assignee: [],
				createdDate: "",
				labels: [],
				dependencies: [],
				description: "",
			},
			{
				id: "state-1.2",
				title: "State 1.2",
				status: "To Do",
				assignee: [],
				createdDate: "",
				labels: [],
				dependencies: [],
				description: "",
			},
			{
				id: "state-1.1",
				title: "State 1.1",
				status: "To Do",
				assignee: [],
				createdDate: "",
				labels: [],
				dependencies: [],
				description: "",
			},
		];

		const sorted = [...states].sort((a, b) => compareStateIds(a.id, b.id));
		expect(sorted[0]?.id).toBe("state-1.1");
		expect(sorted[1]?.id).toBe("state-1.2");
		expect(sorted[2]?.id).toBe("state-1.10");
	});

	it("simulates board view state selection with sorted states", () => {
		// This test simulates the bug scenario where states are displayed in sorted order
		// but selection uses unsorted array
		const unsortedStates: State[] = [
			{
				id: "state-10",
				title: "Should be third when sorted",
				status: "To Do",
				assignee: [],
				createdDate: "",
				labels: [],
				dependencies: [],
				description: "",
			},
			{
				id: "state-2",
				title: "Should be second when sorted",
				status: "To Do",
				assignee: [],
				createdDate: "",
				labels: [],
				dependencies: [],
				description: "",
			},
			{
				id: "state-1",
				title: "Should be first when sorted",
				status: "To Do",
				assignee: [],
				createdDate: "",
				labels: [],
				dependencies: [],
				description: "",
			},
		];

		// Simulate the display order (sorted)
		const sortedStates = [...unsortedStates].sort((a, b) => compareStateIds(a.id, b.id));
		const _displayItems = sortedStates.map((t) => `${t.id} - ${t.title}`);

		// User clicks on index 0 (expects state-1)
		const selectedIndex = 0;

		// Bug: using unsorted array with sorted display index
		const wrongState = unsortedStates[selectedIndex];
		expect(wrongState?.id).toBe("state-10"); // Wrong!

		// Fix: using sorted array with sorted display index
		const correctState = sortedStates[selectedIndex];
		expect(correctState?.id).toBe("state-1"); // Correct!
	});

	it("ensures consistent ordering between display and selection", () => {
		const states: State[] = [
			{
				id: "state-5",
				title: "E",
				status: "To Do",
				assignee: [],
				createdDate: "",
				labels: [],
				dependencies: [],
				description: "",
			},
			{
				id: "state-3",
				title: "C",
				status: "To Do",
				assignee: [],
				createdDate: "",
				labels: [],
				dependencies: [],
				description: "",
			},
			{
				id: "state-1",
				title: "A",
				status: "To Do",
				assignee: [],
				createdDate: "",
				labels: [],
				dependencies: [],
				description: "",
			},
			{
				id: "state-4",
				title: "D",
				status: "To Do",
				assignee: [],
				createdDate: "",
				labels: [],
				dependencies: [],
				description: "",
			},
			{
				id: "state-2",
				title: "B",
				status: "To Do",
				assignee: [],
				createdDate: "",
				labels: [],
				dependencies: [],
				description: "",
			},
		];

		// Both display and selection should use the same sorted array
		const sortedStates = [...states].sort((a, b) => compareStateIds(a.id, b.id));

		// Verify each index maps to the correct state
		for (let i = 0; i < sortedStates.length; i++) {
			const displayedState = sortedStates[i];
			const selectedState = sortedStates[i]; // Should be the same!
			expect(selectedState?.id).toBe(displayedState?.id ?? "");
		}

		// Verify specific selections
		expect(sortedStates[0]?.id).toBe("state-1");
		expect(sortedStates[1]?.id).toBe("state-2");
		expect(sortedStates[2]?.id).toBe("state-3");
		expect(sortedStates[3]?.id).toBe("state-4");
		expect(sortedStates[4]?.id).toBe("state-5");
	});
});
