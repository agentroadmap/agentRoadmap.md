import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import { loadRemoteStates, resolveStateConflict } from "../core/state-loader.ts";
import type { GitOperations } from "../git/operations.ts";
import type { State } from "../types/index.ts";

// Mock GitOperations for testing
class MockGitOperations implements Partial<GitOperations> {
	async fetch(): Promise<void> {
		// Mock fetch
	}

	async listRemoteBranches(): Promise<string[]> {
		return ["main", "feature", "feature2"];
	}

	async listRecentRemoteBranches(_daysAgo: number): Promise<string[]> {
		return ["main", "feature", "feature2"];
	}

	async getBranchLastModifiedMap(_ref: string, _dir: string): Promise<Map<string, Date>> {
		const map = new Map<string, Date>();
		// Add all files with the same date for simplicity
		map.set("roadmap/nodes/state-1 - Main State.md", new Date("2025-06-13"));
		map.set("roadmap/nodes/state-2 - Feature State.md", new Date("2025-06-13"));
		map.set("roadmap/nodes/state-3 - Feature2 State.md", new Date("2025-06-13"));
		return map;
	}

	async listFilesInTree(ref: string, _path: string): Promise<string[]> {
		if (ref === "origin/main") {
			return ["roadmap/nodes/state-1 - Main State.md"];
		}
		if (ref === "origin/feature") {
			return ["roadmap/nodes/state-2 - Feature State.md"];
		}
		if (ref === "origin/feature2") {
			return ["roadmap/nodes/state-3 - Feature2 State.md"];
		}
		return [];
	}

	async showFile(_ref: string, file: string): Promise<string> {
		if (file.includes("state-1")) {
			return `---
id: state-1
title: Main State
status: To Do
assignee: []
created_date: 2025-06-13
labels: []
dependencies: []
---\n\n## Description\n\nMain state`;
		}
		if (file.includes("state-2")) {
			return `---
id: state-2
title: Feature State
status: In Progress
assignee: []
created_date: 2025-06-13
labels: []
dependencies: []
---\n\n## Description\n\nFeature state`;
		}
		if (file.includes("state-3")) {
			return `---
id: state-3
title: Feature2 State
status: Done
assignee: []
created_date: 2025-06-13
labels: []
dependencies: []
---\n\n## Description\n\nFeature2 state`;
		}
		return "";
	}

	async getFileLastModifiedTime(_ref: string, _file: string): Promise<Date | null> {
		return new Date("2025-06-13");
	}
}

describe("Parallel remote state loading", () => {
	let consoleErrorSpy: ReturnType<typeof spyOn>;

	beforeEach(() => {
		consoleErrorSpy = spyOn(console, "error");
	});

	afterEach(() => {
		consoleErrorSpy?.mockRestore();
	});

	it("should load states from multiple branches in parallel", async () => {
		const mockGitOperations = new MockGitOperations() as unknown as GitOperations;

		// Track progress messages
		const progressMessages: string[] = [];
		const remoteStates = await loadRemoteStates(mockGitOperations, null, (msg: string) => {
			progressMessages.push(msg);
		});

		// Verify results - we should have states from all remote branches
		expect(remoteStates.length).toBe(3);
		const stateIds = remoteStates.map((t) => t.id);
		expect(stateIds).toContain("STATE-1");
		expect(stateIds).toContain("STATE-2");
		expect(stateIds).toContain("STATE-3");

		// Verify each state has correct metadata
		const state1 = remoteStates.find((t) => t.id === "STATE-1");
		expect(state1?.source).toBe("remote");
		expect(state1?.branch).toBe("main");
		expect(state1?.status).toBe("To Do");

		// Verify progress reporting
		expect(progressMessages.some((msg) => msg.includes("Fetching remote branches"))).toBe(true);
		expect(progressMessages.some((msg) => msg.includes("Found 3 unique states across remote branches"))).toBe(true);
		expect(progressMessages.some((msg) => msg.includes("Loaded 3 remote states"))).toBe(true);
	});

	it("should handle errors gracefully", async () => {
		// Create a mock that throws an error
		const errorGitOperations = {
			fetch: async () => {
				throw new Error("Network error");
			},
			listRecentRemoteBranches: async (_daysAgo: number) => {
				throw new Error("Network error");
			},
		} as unknown as GitOperations;

		// Should return empty array on error
		const remoteStates = await loadRemoteStates(errorGitOperations, null);
		expect(remoteStates).toEqual([]);

		// Verify error was logged
		expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
		expect(consoleErrorSpy).toHaveBeenCalledWith("Failed to fetch remote states:", expect.any(Error));
	});

	it("should resolve state conflicts correctly", async () => {
		const statuses = ["To Do", "In Progress", "Done"];

		const localState: State = {
			id: "state-1",
			title: "Local State",
			status: "To Do",
			assignee: [],
			createdDate: "2025-06-13",
			labels: [],
			dependencies: [],
			description: "Local version",
			source: "local",
			lastModified: new Date("2025-06-13T10:00:00Z"),
		};

		const remoteState: State = {
			id: "state-1",
			title: "Remote State",
			status: "Done",
			assignee: [],
			createdDate: "2025-06-13",
			labels: [],
			dependencies: [],
			description: "Remote version",
			source: "remote",
			branch: "feature",
			lastModified: new Date("2025-06-13T12:00:00Z"),
		};

		// Test most_progressed strategy - should pick Done over To Do
		const resolved1 = resolveStateConflict(localState, remoteState, statuses, "most_progressed");
		expect(resolved1.status).toBe("Done");
		expect(resolved1.title).toBe("Remote State");

		// Test most_recent strategy - should pick the more recent one
		const resolved2 = resolveStateConflict(localState, remoteState, statuses, "most_recent");
		expect(resolved2.lastModified).toEqual(new Date("2025-06-13T12:00:00Z"));
		expect(resolved2.title).toBe("Remote State");
	});
});
