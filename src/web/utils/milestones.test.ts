import { describe, expect, it } from "bun:test";
import type { Milestone, State } from "../../types";
import { buildMilestoneBuckets, collectMilestoneIds, validateMilestoneName } from "./milestones";

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

describe("buildMilestoneBuckets", () => {
	const states = [
		makeState({ id: "state-1", milestone: "M1", status: "To Do" }),
		makeState({ id: "state-2", milestone: "M2", status: "In Progress" }),
		makeState({ id: "state-3", status: "Done" }),
	];

	it("returns buckets for file milestones, discovered milestones, and no-milestone", () => {
		const milestones: Milestone[] = [{ id: "M1", title: "M1", description: "", rawContent: "" }];
		const buckets = buildMilestoneBuckets(states, milestones, ["To Do", "In Progress", "Done"]);
		const labels = buckets.map((b) => b.label);
		expect(labels).toEqual(["States without milestone", "M1", "M2"]);
	});

	it("calculates status counts per bucket", () => {
		const milestones: Milestone[] = [{ id: "M1", title: "M1", description: "", rawContent: "" }];
		const buckets = buildMilestoneBuckets(states, milestones, ["To Do", "In Progress", "Done"]);
		const m1 = buckets.find((b) => b.label === "M1");
		const none = buckets.find((b) => b.isNoMilestone);
		expect(m1?.statusCounts["To Do"]).toBe(1);
		expect(none?.statusCounts.Done).toBe(1);
	});

	it("marks milestones completed when all states are done", () => {
		const completedStates = [
			makeState({ id: "state-1", milestone: "M1", status: "Done" }),
			makeState({ id: "state-2", milestone: "M1", status: "Done" }),
		];
		const milestones: Milestone[] = [{ id: "M1", title: "M1", description: "", rawContent: "" }];
		const buckets = buildMilestoneBuckets(completedStates, milestones, ["To Do", "In Progress", "Done"]);
		const m1 = buckets.find((b) => b.label === "M1");
		expect(m1?.isCompleted).toBe(true);
	});

	it("keeps active milestones when archived titles are reused", () => {
		const states = [makeState({ id: "state-1", milestone: "m-2", status: "To Do" })];
		const milestones: Milestone[] = [
			{ id: "m-1", title: "Release 1", description: "", rawContent: "" },
			{ id: "m-2", title: "Release 1", description: "", rawContent: "" },
		];
		const buckets = buildMilestoneBuckets(states, milestones, ["To Do", "Done"], {
			archivedMilestoneIds: ["m-1", "Release 1"],
		});
		const active = buckets.find((bucket) => bucket.milestone === "m-2");
		expect(active?.label).toBe("Release 1");
	});

	it("canonicalizes reused archived titles to the active milestone ID", () => {
		const states = [
			makeState({ id: "state-1", milestone: "Release 1", status: "To Do" }),
			makeState({ id: "state-2", milestone: "m-2", status: "Done" }),
		];
		const milestones: Milestone[] = [{ id: "m-2", title: "Release 1", description: "", rawContent: "" }];
		const archivedMilestones: Milestone[] = [{ id: "m-1", title: "Release 1", description: "", rawContent: "" }];

		const buckets = buildMilestoneBuckets(states, milestones, ["To Do", "Done"], {
			archivedMilestoneIds: ["m-1"],
			archivedMilestones,
		});
		const releaseBuckets = buckets.filter((bucket) => bucket.label === "Release 1");
		expect(releaseBuckets).toHaveLength(1);
		expect(releaseBuckets[0]?.milestone).toBe("m-2");
		expect(releaseBuckets[0]?.states.map((state) => state.id)).toEqual(["state-1", "state-2"]);
	});

	it("canonicalizes numeric milestone aliases to milestone IDs", () => {
		const states = [makeState({ id: "state-1", milestone: "1", status: "To Do" })];
		const milestones: Milestone[] = [{ id: "m-1", title: "Release 1", description: "", rawContent: "" }];
		const buckets = buildMilestoneBuckets(states, milestones, ["To Do", "Done"]);
		const releaseBucket = buckets.find((bucket) => bucket.milestone === "m-1");
		expect(releaseBucket?.states.map((state) => state.id)).toEqual(["state-1"]);
	});

	it("canonicalizes zero-padded milestone ID aliases to canonical IDs", () => {
		const states = [makeState({ id: "state-1", milestone: "m-01", status: "To Do" })];
		const milestones: Milestone[] = [{ id: "m-1", title: "Release 1", description: "", rawContent: "" }];
		const buckets = buildMilestoneBuckets(states, milestones, ["To Do", "Done"]);
		const releaseBucket = buckets.find((bucket) => bucket.milestone === "m-1");
		expect(releaseBucket?.states.map((state) => state.id)).toEqual(["state-1"]);
	});

	it("keeps active-title aliases when an archived milestone ID shares the same key", () => {
		const states = [makeState({ id: "state-1", milestone: "m-0", status: "To Do" })];
		const milestones: Milestone[] = [{ id: "m-2", title: "m-0", description: "", rawContent: "" }];
		const archivedMilestones: Milestone[] = [{ id: "m-0", title: "Historical", description: "", rawContent: "" }];
		const buckets = buildMilestoneBuckets(states, milestones, ["To Do", "Done"], {
			archivedMilestones,
			archivedMilestoneIds: ["m-0"],
		});
		const noMilestoneBucket = buckets.find((bucket) => bucket.isNoMilestone);
		expect(noMilestoneBucket?.states.map((state) => state.id)).toEqual(["state-1"]);
	});

	it("prefers real milestone IDs over numeric title aliases", () => {
		const states = [makeState({ id: "state-1", milestone: "1", status: "To Do" })];
		const milestones: Milestone[] = [
			{ id: "m-1", title: "Release 1", description: "", rawContent: "" },
			{ id: "m-2", title: "1", description: "", rawContent: "" },
		];
		const buckets = buildMilestoneBuckets(states, milestones, ["To Do", "Done"]);
		const idBucket = buckets.find((bucket) => bucket.milestone === "m-1");
		const titleBucket = buckets.find((bucket) => bucket.milestone === "m-2");
		expect(idBucket?.states.map((state) => state.id)).toEqual(["state-1"]);
		expect(titleBucket?.states.map((state) => state.id) ?? []).toHaveLength(0);
	});
});

describe("collectMilestoneIds", () => {
	const states = [
		makeState({ id: "state-1", milestone: "M1" }),
		makeState({ id: "state-2", milestone: "New" }),
		makeState({ id: "state-3" }),
	];
	const milestones: Milestone[] = [{ id: "M1", title: "M1", description: "", rawContent: "" }];

	it("merges file milestones and discovered state milestones without duplicates", () => {
		expect(collectMilestoneIds(states, milestones)).toEqual(["M1", "New"]);
	});

	it("normalizes whitespace and casing", () => {
		const variantStates = [
			makeState({ id: "state-1", milestone: "  m1  " }),
			makeState({ id: "state-2", milestone: "New" }),
		];
		const result = collectMilestoneIds(variantStates, milestones);
		expect(result).toEqual(["M1", "New"]);
	});
});

describe("validateMilestoneName", () => {
	it("rejects empty names", () => {
		expect(validateMilestoneName("   ", [])).toBe("Milestone name cannot be empty.");
	});

	it("rejects duplicates case-insensitively", () => {
		expect(validateMilestoneName("Alpha", ["alpha", "Beta"])).toBe("Milestone already exists.");
		expect(validateMilestoneName(" beta  ", ["alpha", "Beta"])).toBe("Milestone already exists.");
	});

	it("allows unique names", () => {
		expect(validateMilestoneName("Release", ["alpha", "Beta"])).toBeNull();
	});
});
