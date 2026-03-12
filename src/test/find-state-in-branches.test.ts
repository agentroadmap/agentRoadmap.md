import { describe, expect, it } from "bun:test";
import { findStateInLocalBranches, findStateInRemoteBranches } from "../core/state-loader.ts";
import type { GitOperations } from "../git/operations.ts";

type PartialGitOps = Partial<GitOperations>;

describe("findStateInRemoteBranches", () => {
	it("should return null when git has no remotes", async () => {
		const mockGit: PartialGitOps = {
			hasAnyRemote: async () => false,
		};
		const result = await findStateInRemoteBranches(mockGit as GitOperations, "state-999");
		expect(result).toBeNull();
	});

	it("should return null when no branches exist", async () => {
		const mockGit: PartialGitOps = {
			hasAnyRemote: async () => true,
			listRecentRemoteBranches: async () => [],
		};
		const result = await findStateInRemoteBranches(mockGit as GitOperations, "state-999");
		expect(result).toBeNull();
	});

	it("should return null when state is not in any branch", async () => {
		const mockGit: PartialGitOps = {
			hasAnyRemote: async () => true,
			listRecentRemoteBranches: async () => ["main"],
			listFilesInTree: async () => ["roadmap/nodes/state-1 - some state.md"],
			getBranchLastModifiedMap: async () => new Map([["roadmap/nodes/state-1 - some state.md", new Date()]]),
		};
		const result = await findStateInRemoteBranches(mockGit as GitOperations, "state-999");
		expect(result).toBeNull();
	});

	it("should find and load state from remote branch", async () => {
		const mockStateContent = `---
id: state-123
title: Test State
status: To Do
assignee: []
created_date: '2025-01-01 12:00'
labels: []
dependencies: []
---

## Description

Test description
`;
		const mockGit: PartialGitOps = {
			hasAnyRemote: async () => true,
			listRecentRemoteBranches: async () => ["feature"],
			listFilesInTree: async () => ["roadmap/nodes/state-123 - Test State.md"],
			getBranchLastModifiedMap: async () =>
				new Map([["roadmap/nodes/state-123 - Test State.md", new Date("2025-01-01")]]),
			showFile: async () => mockStateContent,
		};

		const result = await findStateInRemoteBranches(mockGit as GitOperations, "state-123");
		expect(result).not.toBeNull();
		expect(result?.id).toBe("STATE-123");
		expect(result?.source).toBe("remote");
		expect(result?.branch).toBe("feature");
	});
});

describe("findStateInLocalBranches", () => {
	it("should return null when on detached HEAD", async () => {
		const mockGit: PartialGitOps = {
			getCurrentBranch: async () => "",
		};
		const result = await findStateInLocalBranches(mockGit as GitOperations, "state-999");
		expect(result).toBeNull();
	});

	it("should return null when only current branch exists", async () => {
		const mockGit: PartialGitOps = {
			getCurrentBranch: async () => "main",
			listRecentBranches: async () => ["main"],
		};
		const result = await findStateInLocalBranches(mockGit as GitOperations, "state-999");
		expect(result).toBeNull();
	});

	it("should find and load state from another local branch", async () => {
		const mockStateContent = `---
id: state-456
title: Local Branch State
status: In Progress
assignee: []
created_date: '2025-01-01 12:00'
labels: []
dependencies: []
---

## Description

From local branch
`;
		const mockGit: PartialGitOps = {
			getCurrentBranch: async () => "main",
			listRecentBranches: async () => ["main", "feature-branch"],
			listFilesInTree: async () => ["roadmap/nodes/state-456 - Local Branch State.md"],
			getBranchLastModifiedMap: async () =>
				new Map([["roadmap/nodes/state-456 - Local Branch State.md", new Date("2025-01-01")]]),
			showFile: async () => mockStateContent,
		};

		const result = await findStateInLocalBranches(mockGit as GitOperations, "state-456");
		expect(result).not.toBeNull();
		expect(result?.id).toBe("STATE-456");
		expect(result?.source).toBe("local-branch");
		expect(result?.branch).toBe("feature-branch");
	});
});
