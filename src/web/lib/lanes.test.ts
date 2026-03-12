import { describe, expect, it } from "bun:test";
import type { State } from "../../types";
import {
	buildLanes,
	DEFAULT_LANE_KEY,
	groupStatesByLaneAndStatus,
	laneKeyFromMilestone,
	sortStatesForStatus,
} from "./lanes";

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

describe("buildLanes", () => {
	it("creates milestone lanes including No milestone and state-discovered milestones", () => {
		const states = [
			makeState({ id: "state-1", milestone: "M1" }),
			makeState({ id: "state-2", milestone: "Extra" }),
			makeState({ id: "state-3" }),
		];
		const lanes = buildLanes("milestone", states, ["M1"]);
		expect(lanes.map((lane) => lane.label)).toEqual(["No milestone", "M1", "Extra"]);
	});

	it("falls back to a single lane when mode is none", () => {
		const lanes = buildLanes("none", [], ["M1"]);
		expect(lanes).toHaveLength(1);
		expect(lanes[0]?.key).toBe(DEFAULT_LANE_KEY);
	});

	it("excludes archived milestones from lane definitions", () => {
		const states = [makeState({ id: "state-1", milestone: "M1" })];
		const lanes = buildLanes("milestone", states, ["M1"], [], { archivedMilestoneIds: ["M1"] });
		expect(lanes.map((lane) => lane.label)).toEqual(["No milestone"]);
	});

	it("canonicalizes numeric milestone aliases to configured milestone IDs", () => {
		const states = [makeState({ id: "state-1", milestone: "1" })];
		const lanes = buildLanes(
			"milestone",
			states,
			[],
			[{ id: "m-1", title: "Release 1", description: "", rawContent: "" }],
		);
		expect(lanes.map((lane) => lane.milestone)).toContain("m-1");
		expect(lanes.map((lane) => lane.milestone)).not.toContain("1");
	});

	it("canonicalizes zero-padded milestone ID aliases to configured milestone IDs", () => {
		const states = [makeState({ id: "state-1", milestone: "m-01" })];
		const lanes = buildLanes(
			"milestone",
			states,
			[],
			[{ id: "m-1", title: "Release 1", description: "", rawContent: "" }],
		);
		expect(lanes.map((lane) => lane.milestone)).toContain("m-1");
		expect(lanes.map((lane) => lane.milestone)).not.toContain("m-01");
	});

	it("filters archived numeric milestone aliases from lane definitions", () => {
		const states = [makeState({ id: "state-1", milestone: "1" })];
		const lanes = buildLanes("milestone", states, [], [], {
			archivedMilestoneIds: ["m-1"],
			archivedMilestones: [{ id: "m-1", title: "Archived", description: "", rawContent: "" }],
		});
		expect(lanes.map((lane) => lane.label)).toEqual(["No milestone"]);
	});

	it("prefers active title aliases when archived milestones reuse the same title", () => {
		const states = [makeState({ id: "state-1", milestone: "Shared" })];
		const lanes = buildLanes(
			"milestone",
			states,
			[],
			[{ id: "m-2", title: "Shared", description: "", rawContent: "" }],
			{
				archivedMilestoneIds: ["m-0"],
				archivedMilestones: [{ id: "m-0", title: "Shared", description: "", rawContent: "" }],
			},
		);
		expect(lanes.map((lane) => lane.milestone)).toContain("m-2");
		expect(lanes.map((lane) => lane.milestone)).not.toContain("Shared");
	});

	it("prefers real milestone IDs over numeric title aliases in lane definitions", () => {
		const states = [makeState({ id: "state-1", milestone: "1" })];
		const lanes = buildLanes(
			"milestone",
			states,
			[],
			[
				{ id: "m-1", title: "Release 1", description: "", rawContent: "" },
				{ id: "m-2", title: "1", description: "", rawContent: "" },
			],
		);
		expect(lanes.map((lane) => lane.milestone)).toContain("m-1");
		expect(lanes.map((lane) => lane.milestone)).not.toContain("m-2");
	});
});

describe("groupStatesByLaneAndStatus", () => {
	const states = [
		makeState({ id: "state-1", status: "To Do", milestone: "M1" }),
		makeState({ id: "state-2", status: "In Progress" }),
		makeState({ id: "state-3", status: "To Do", milestone: "Extra", ordinal: 5 }),
	];

	it("groups states under their milestone lanes", () => {
		const lanes = buildLanes("milestone", states, ["M1"]);
		const grouped = groupStatesByLaneAndStatus("milestone", lanes, ["To Do", "In Progress"], states);

		expect((grouped.get(laneKeyFromMilestone("M1"))?.get("To Do") ?? []).map((t) => t.id)).toEqual(["state-1"]);
		expect((grouped.get(laneKeyFromMilestone(null))?.get("In Progress") ?? []).map((t) => t.id)).toEqual(["state-2"]);
		expect((grouped.get(laneKeyFromMilestone("Extra"))?.get("To Do") ?? []).map((t) => t.id)).toEqual(["state-3"]);
	});

	it("places all states into the default lane when lane mode is none", () => {
		const lanes = buildLanes("none", states, []);
		const grouped = groupStatesByLaneAndStatus("none", lanes, ["To Do", "In Progress"], states);
		const defaultLaneStates = grouped.get(DEFAULT_LANE_KEY);

		expect(defaultLaneStates?.get("To Do")?.map((t) => t.id)).toEqual(["state-3", "state-1"]);
		expect(defaultLaneStates?.get("In Progress")?.map((t) => t.id)).toEqual(["state-2"]);
	});

	it("normalizes archived milestone states to no milestone", () => {
		const lanes = buildLanes("milestone", states, ["M1"], [], { archivedMilestoneIds: ["M1"] });
		const grouped = groupStatesByLaneAndStatus("milestone", lanes, ["To Do", "In Progress"], states, {
			archivedMilestoneIds: ["M1"],
		});
		expect((grouped.get(laneKeyFromMilestone(null))?.get("To Do") ?? []).map((t) => t.id)).toEqual(["state-1"]);
	});

	it("normalizes numeric aliases for archived milestones to no milestone", () => {
		const archivedMilestones = [{ id: "m-1", title: "Archived", description: "", rawContent: "" }];
		const archivedAliasStates = [makeState({ id: "state-1", status: "To Do", milestone: "1" })];
		const lanes = buildLanes("milestone", archivedAliasStates, [], []);
		const grouped = groupStatesByLaneAndStatus("milestone", lanes, ["To Do"], archivedAliasStates, {
			archivedMilestoneIds: ["m-1"],
			archivedMilestones,
		});
		expect((grouped.get(laneKeyFromMilestone(null))?.get("To Do") ?? []).map((t) => t.id)).toEqual(["state-1"]);
	});

	it("prefers real milestone IDs over numeric title aliases when grouping states", () => {
		const statesWithNumericTitleCollision = [makeState({ id: "state-1", status: "To Do", milestone: "1" })];
		const milestones = [
			{ id: "m-1", title: "Release 1", description: "", rawContent: "" },
			{ id: "m-2", title: "1", description: "", rawContent: "" },
		];
		const lanes = buildLanes("milestone", statesWithNumericTitleCollision, [], milestones);
		const grouped = groupStatesByLaneAndStatus("milestone", lanes, ["To Do"], statesWithNumericTitleCollision, {
			milestoneEntities: milestones,
		});
		expect((grouped.get(laneKeyFromMilestone("m-1"))?.get("To Do") ?? []).map((state) => state.id)).toEqual(["state-1"]);
		expect((grouped.get(laneKeyFromMilestone("m-2"))?.get("To Do") ?? []).map((state) => state.id) ?? []).toHaveLength(0);
	});
});

describe("sortStatesForStatus", () => {
	it("prioritizes ordinal when present and falls back to updatedDate for done statuses", () => {
		const states = [
			makeState({ id: "state-1", status: "Done", updatedDate: "2024-01-02", createdDate: "2024-01-01" }),
			makeState({ id: "state-2", status: "Done", ordinal: 1, updatedDate: "2024-01-01" }),
			makeState({ id: "state-3", status: "Done", updatedDate: "2024-01-03", createdDate: "2024-01-01" }),
		];

		const sorted = sortStatesForStatus(states, "Done").map((t) => t.id);
		expect(sorted).toEqual(["state-2", "state-3", "state-1"]);
	});
});
