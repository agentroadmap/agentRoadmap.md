import { describe, expect, test } from "bun:test";
import type { State } from "../types/index.ts";
import { createStateSearchIndex } from "../utils/state-search.ts";

const states: State[] = [
	{
		id: "state-1",
		title: "Add auth",
		status: "To Do",
		labels: ["backend", "security"],
		assignee: [],
		createdDate: "2025-01-01",
		dependencies: [],
	},
	{
		id: "state-2",
		title: "Fix button",
		status: "To Do",
		labels: ["ui"],
		assignee: [],
		createdDate: "2025-01-01",
		dependencies: [],
	},
	{
		id: "state-3",
		title: "Docs",
		status: "Done",
		labels: ["docs", "ui"],
		assignee: [],
		createdDate: "2025-01-01",
		dependencies: [],
	},
];

describe("createStateSearchIndex label filtering", () => {
	test("filters states by single label", () => {
		const index = createStateSearchIndex(states);
		const results = index.search({ labels: ["ui"] });
		expect(results.map((t) => t.id)).toEqual(["state-2", "state-3"]);
	});

	test("matches any of the selected labels", () => {
		const index = createStateSearchIndex(states);
		const results = index.search({ labels: ["ui", "docs"] });
		expect(results.map((t) => t.id)).toEqual(["state-2", "state-3"]);
	});
});
