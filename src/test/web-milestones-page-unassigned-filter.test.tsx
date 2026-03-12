import { describe, expect, it } from "bun:test";
import React from "react";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import type { Milestone, State } from "../types/index.ts";
import MilestonesPage from "../web/components/MilestonesPage";

const statuses = ["To Do", "In Progress", "Done"];

const milestones: Milestone[] = [{ id: "m-1", title: "Release 1", description: "", rawContent: "" }];

const makeState = (overrides: Partial<State>): State => ({
	id: "state-1",
	title: "State",
	status: "To Do",
	assignee: [],
	labels: [],
	dependencies: [],
	createdDate: "2024-01-01",
	...overrides,
});

const renderMilestonesPage = (states: State[]) =>
	renderToString(
		<MemoryRouter>
			<MilestonesPage
				states={states}
				statuses={statuses}
				milestoneEntities={milestones}
				archivedMilestones={[]}
				onEditState={() => {}}
			/>
		</MemoryRouter>,
	);

const getUnassignedCount = (html: string): string | undefined => {
	const normalizedHtml = html.replaceAll("<!-- -->", "");
	const match = normalizedHtml.match(/Unassigned states[\s\S]*?\((\d+)\)/);
	return match?.[1];
};

describe("MilestonesPage unassigned filtering", () => {
	it("hides done unassigned states and counts only non-done unassigned states", () => {
		const html = renderMilestonesPage([
			makeState({ id: "state-1", title: "Unassigned active", status: "To Do" }),
			makeState({ id: "state-2", title: "Unassigned done", status: "Done" }),
			makeState({ id: "state-3", title: "Milestone active", milestone: "m-1", status: "To Do" }),
		]);

		expect(html).toContain("Unassigned active");
		expect(html).not.toContain("Unassigned done");
		expect(getUnassignedCount(html)).toBe("1");
		expect(html).toContain("Milestone active");
	});

	it("shows an empty state when all unassigned states are done", () => {
		const html = renderMilestonesPage([
			makeState({ id: "state-1", title: "Done unassigned", status: "Done" }),
			makeState({ id: "state-2", title: "Complete unassigned", status: "Complete" }),
		]);

		expect(html).toContain("No active unassigned states. Completed states are hidden.");
		expect(html).not.toContain("Done unassigned");
		expect(html).not.toContain("Complete unassigned");
		expect(getUnassignedCount(html)).toBe("0");
	});

	it("keeps milestone-assigned groups rendering with existing behavior", () => {
		const html = renderMilestonesPage([
			makeState({ id: "state-1", title: "Unassigned done", status: "Done" }),
			makeState({ id: "state-2", title: "Milestone state", milestone: "m-1", status: "In Progress" }),
		]);

		expect(html).toContain("Release 1");
		expect(html).toContain("Milestone state");
		expect(html).not.toContain("Unassigned done");
	});
});
