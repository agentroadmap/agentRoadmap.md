import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { $ } from "bun";
import { Core } from "../index.ts";
import type { State } from "../types/index.ts";
import { createUniqueTestDir, safeCleanup } from "./test-utils.ts";

let TEST_DIR: string;
const CLI_PATH = join(process.cwd(), "src", "cli.ts");

async function initGitRepo(dir: string) {
	await $`git init -b main`.cwd(dir).quiet();
	await $`git config user.name "Test User"`.cwd(dir).quiet();
	await $`git config user.email test@example.com`.cwd(dir).quiet();
}

describe("CLI parent state id normalization", () => {
	beforeEach(async () => {
		TEST_DIR = createUniqueTestDir("test-parent-normalization");
		await mkdir(TEST_DIR, { recursive: true });
		await initGitRepo(TEST_DIR);
	});

	afterEach(async () => {
		try {
			await safeCleanup(TEST_DIR);
		} catch {
			// Ignore cleanup errors
		}
	});

	it("should normalize parent state id when creating substates", async () => {
		const core = new Core(TEST_DIR);
		await core.initializeProject("Normalization Test", true);

		const parent: State = {
			id: "state-4",
			title: "Parent",
			status: "To Do",
			assignee: [],
			createdDate: "2025-06-08",
			labels: [],
			dependencies: [],
		};
		await core.createState(parent, true);

		await $`bun run ${CLI_PATH} state create Child --parent 4`.cwd(TEST_DIR).quiet();

		const child = await core.filesystem.loadState("state-4.1");
		expect(child?.parentStateId).toBe("STATE-4");
	});
});
