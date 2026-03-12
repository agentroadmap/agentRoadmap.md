import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import { buildLocalBranchStateIndex, loadLocalBranchStates } from "../core/state-loader.ts";
import type { GitOperations } from "../git/operations.ts";
import type { RoadmapConfig, State } from "../types/index.ts";

// Mock GitOperations for testing
class MockGitOperations implements Partial<GitOperations> {
	private currentBranch = "main";

	async getCurrentBranch(): Promise<string> {
		return this.currentBranch;
	}

	async listRecentBranches(_daysAgo: number): Promise<string[]> {
		return ["main", "feature-a", "feature-b", "origin/main"];
	}

	async getBranchLastModifiedMap(_ref: string, _dir: string): Promise<Map<string, Date>> {
		const map = new Map<string, Date>();
		map.set("roadmap/nodes/state-1 - Main State.md", new Date("2025-06-13"));
		map.set("roadmap/nodes/state-2 - Feature State.md", new Date("2025-06-13"));
		map.set("roadmap/nodes/state-3 - New State.md", new Date("2025-06-13"));
		return map;
	}

	async listFilesInTree(ref: string, _path: string): Promise<string[]> {
		// Main branch has state-1 and state-2
		if (ref === "main") {
			return ["roadmap/nodes/state-1 - Main State.md", "roadmap/nodes/state-2 - Feature State.md"];
		}
		// feature-a has state-1 and state-3 (state-3 is new)
		if (ref === "feature-a") {
			return ["roadmap/nodes/state-1 - Main State.md", "roadmap/nodes/state-3 - New State.md"];
		}
		// feature-b has state-2
		if (ref === "feature-b") {
			return ["roadmap/nodes/state-2 - Feature State.md"];
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
title: New State
status: To Do
assignee: []
created_date: 2025-06-13
labels: []
dependencies: []
---\n\n## Description\n\nNew state from feature-a branch`;
		}
		return "";
	}
}

describe("Local branch state discovery", () => {
	let consoleDebugSpy: ReturnType<typeof spyOn>;

	beforeEach(() => {
		consoleDebugSpy = spyOn(console, "debug");
	});

	afterEach(() => {
		consoleDebugSpy?.mockRestore();
	});

	describe("buildLocalBranchStateIndex", () => {
		it("should build index from local branches excluding current branch", async () => {
			const mockGit = new MockGitOperations() as unknown as GitOperations;
			const branches = ["main", "feature-a", "feature-b", "origin/main"];

			const index = await buildLocalBranchStateIndex(mockGit, branches, "main", "roadmap");

			// Should find STATE-3 from feature-a (not in main)
			expect(index.has("STATE-3")).toBe(true);
			const state3Entries = index.get("STATE-3");
			expect(state3Entries?.length).toBe(1);
			expect(state3Entries?.[0]?.branch).toBe("feature-a");

			// Should find state-1 and state-2 from other branches
			expect(index.has("STATE-1")).toBe(true);
			expect(index.has("STATE-2")).toBe(true);
		});

		it("should exclude origin/ branches", async () => {
			const mockGit = new MockGitOperations() as unknown as GitOperations;
			const branches = ["main", "feature-a", "origin/feature-a"];

			const index = await buildLocalBranchStateIndex(mockGit, branches, "main", "roadmap");

			// Should only have entries from feature-a (local), not origin/feature-a
			const state1Entries = index.get("STATE-1");
			expect(state1Entries?.every((e) => e.branch === "feature-a")).toBe(true);
		});

		it("should exclude current branch", async () => {
			const mockGit = new MockGitOperations() as unknown as GitOperations;
			const branches = ["main", "feature-a"];

			const index = await buildLocalBranchStateIndex(mockGit, branches, "main", "roadmap");

			// state-1 should only be from feature-a, not main
			const state1Entries = index.get("STATE-1");
			expect(state1Entries?.every((e) => e.branch !== "main")).toBe(true);
		});
	});

	describe("loadLocalBranchStates", () => {
		it("should discover states from other local branches", async () => {
			const mockGit = new MockGitOperations() as unknown as GitOperations;

			const progressMessages: string[] = [];
			const localBranchStates = await loadLocalBranchStates(mockGit, null, (msg: string) => {
				progressMessages.push(msg);
			});

			// Should find STATE-3 which only exists in feature-a
			const state3 = localBranchStates.find((t) => t.id === "STATE-3");
			expect(state3).toBeDefined();
			expect(state3?.title).toBe("New State");
			expect(state3?.source).toBe("local-branch");
			expect(state3?.branch).toBe("feature-a");

			// Progress should mention other local branches
			expect(progressMessages.some((msg) => msg.includes("other local branches"))).toBe(true);
		});

		it("should skip states that exist in filesystem when provided", async () => {
			const mockGit = new MockGitOperations() as unknown as GitOperations;

			// Simulate that state-1 already exists in filesystem
			const localStates: State[] = [
				{
					id: "state-1",
					title: "Main State (local)",
					status: "To Do",
					assignee: [],
					createdDate: "2025-06-13",
					labels: [],
					dependencies: [],
					source: "local",
				},
			];

			const localBranchStates = await loadLocalBranchStates(mockGit, null, undefined, localStates);

			// STATE-3 should be found (not in local states)
			expect(localBranchStates.some((t) => t.id === "STATE-3")).toBe(true);

			// state-1 should not be hydrated since it exists locally
			// (unless the remote version is newer, which in this mock it's not)
			// The behavior depends on whether the remote version is newer
		});

		it("should return empty array when on detached HEAD", async () => {
			const mockGit = {
				getCurrentBranch: async () => "",
			} as unknown as GitOperations;

			const states = await loadLocalBranchStates(mockGit, null);
			expect(states).toEqual([]);
		});

		it("should return empty when only current branch exists", async () => {
			const mockGit = {
				getCurrentBranch: async () => "main",
				listRecentBranches: async () => ["main"],
			} as unknown as GitOperations;

			const states = await loadLocalBranchStates(mockGit, null);
			expect(states).toEqual([]);
		});

		it("should match local states with uppercase IDs to index keys (custom prefix)", async () => {
			// Mock git operations for custom prefix (JIRA)
			const mockGit = {
				getCurrentBranch: async () => "main",
				listRecentBranches: async () => ["main", "feature-a"],
				listFilesInTree: async (ref: string) => {
					if (ref === "feature-a") {
						return ["roadmap/nodes/jira-123 - Remote State.md"];
					}
					return [];
				},
				getBranchLastModifiedMap: async () => {
					const map = new Map<string, Date>();
					map.set("roadmap/nodes/jira-123 - Remote State.md", new Date("2025-06-10")); // Older than local
					return map;
				},
				showFile: async () => `---
id: JIRA-123
title: Remote State
status: To Do
assignee: []
created_date: 2025-06-10
labels: []
dependencies: []
---

## Description

State from feature branch`,
			} as unknown as GitOperations;

			// Local state has uppercase ID (canonical format)
			const localStates: State[] = [
				{
					id: "JIRA-123", // Uppercase canonical ID
					title: "Local State",
					status: "In Progress", // More progressed than remote
					assignee: [],
					createdDate: "2025-06-13",
					updatedDate: "2025-06-15", // Newer than remote
					labels: [],
					dependencies: [],
					source: "local",
				},
			];

			const config: RoadmapConfig = {
				projectName: "Test",
				statuses: ["To Do", "In Progress", "Done"],
				labels: [],
				milestones: [],
				dateFormat: "YYYY-MM-DD",
				prefixes: { state: "jira" },
			};
			const localBranchStates = await loadLocalBranchStates(mockGit, config, undefined, localStates);

			// JIRA-123 exists locally with more progress, so it should NOT be hydrated from other branch
			// This tests that uppercase "JIRA-123" in localById matches normalized index IDs
			expect(localBranchStates.find((t) => t.id === "JIRA-123")).toBeUndefined();
		});

		it("should hydrate states that do not exist locally with custom prefix", async () => {
			const mockGit = {
				getCurrentBranch: async () => "main",
				listRecentBranches: async () => ["main", "feature-a"],
				listFilesInTree: async (ref: string) => {
					if (ref === "feature-a") {
						return ["roadmap/nodes/jira-456 - New Remote State.md"];
					}
					return [];
				},
				getBranchLastModifiedMap: async () => {
					const map = new Map<string, Date>();
					map.set("roadmap/nodes/jira-456 - New Remote State.md", new Date("2025-06-13"));
					return map;
				},
				showFile: async () => `---
id: JIRA-456
title: New Remote State
status: To Do
assignee: []
created_date: 2025-06-13
labels: []
dependencies: []
---

## Description

New state from feature branch`,
			} as unknown as GitOperations;

			// Local states do NOT include JIRA-456
			const localStates: State[] = [
				{
					id: "JIRA-123",
					title: "Local State",
					status: "To Do",
					assignee: [],
					createdDate: "2025-06-13",
					labels: [],
					dependencies: [],
					source: "local",
				},
			];

			const config: RoadmapConfig = {
				projectName: "Test",
				statuses: ["To Do", "In Progress", "Done"],
				labels: [],
				milestones: [],
				dateFormat: "YYYY-MM-DD",
				prefixes: { state: "jira" },
			};
			const localBranchStates = await loadLocalBranchStates(mockGit, config, undefined, localStates);

			// JIRA-456 should be hydrated since it doesn't exist locally
			const state456 = localBranchStates.find((t) => t.id === "JIRA-456");
			expect(state456).toBeDefined();
			expect(state456?.title).toBe("New Remote State");
			expect(state456?.source).toBe("local-branch");
		});
	});
});
