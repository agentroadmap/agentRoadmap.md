import { describe, expect, it } from "bun:test";
import { buildRemoteTaskIndex } from "../core/task-loader.ts";
import type { GitOperations } from "../git/operations.ts";

class MockGit implements Partial<GitOperations> {
	public refs: string[] = [];

	async listFilesInTree(ref: string, _path: string): Promise<string[]> {
		this.refs.push(ref);
		return ["backlog/tasks/task-1 - Test.md"];
	}

	async getBranchLastModifiedMap(_ref: string, _path: string): Promise<Map<string, Date>> {
		return new Map([["backlog/tasks/task-1 - Test.md", new Date()]]);
	}
}

describe("buildRemoteTaskIndex branch handling", () => {
	it("normalizes various branch forms to canonical refs", async () => {
		const git = new MockGit() as unknown as GitOperations;
		await buildRemoteTaskIndex(git, ["main", "origin/main", "refs/remotes/origin/main"]);
		expect(git.refs).toEqual(["origin/main", "origin/main", "origin/main"]);
	});

	it("filters out invalid branch entries", async () => {
		const git = new MockGit() as unknown as GitOperations;
		await buildRemoteTaskIndex(git, ["main", "origin", "origin/HEAD", "HEAD"]);
		expect(git.refs).toEqual(["origin/main"]);
	});
});
