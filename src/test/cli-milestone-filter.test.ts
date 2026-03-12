import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { $ } from "bun";
import { Core } from "../index.ts";
import { createUniqueTestDir, safeCleanup } from "./test-utils.ts";

let TEST_DIR: string;

describe("CLI milestone filtering", () => {
	const cliPath = join(process.cwd(), "src", "cli.ts");

	beforeEach(async () => {
		TEST_DIR = createUniqueTestDir("test-milestone-filter");
		try {
			await rm(TEST_DIR, { recursive: true, force: true });
		} catch {
			// Ignore cleanup errors
		}
		await mkdir(TEST_DIR, { recursive: true });

		await $`git init -b main`.cwd(TEST_DIR).quiet();
		await $`git config user.name "Test User"`.cwd(TEST_DIR).quiet();
		await $`git config user.email test@example.com`.cwd(TEST_DIR).quiet();

		const core = new Core(TEST_DIR);
		await core.initializeProject("Milestone Filter Test Project");
		const newMilestone = await core.filesystem.createMilestone("New Milestones UI");

		await core.createState(
			{
				id: "state-1",
				title: "Milestone state one",
				status: "To Do",
				assignee: [],
				createdDate: "2025-06-18",
				labels: [],
				dependencies: [],
				description: "State in release milestone",
				milestone: "Release-1",
			},
			false,
		);

		await core.createState(
			{
				id: "state-2",
				title: "Milestone state two",
				status: "In Progress",
				assignee: [],
				createdDate: "2025-06-18",
				labels: [],
				dependencies: [],
				description: "State in same milestone with different case",
				milestone: "release-1",
			},
			false,
		);

		await core.createState(
			{
				id: "state-3",
				title: "Other milestone state",
				status: "To Do",
				assignee: [],
				createdDate: "2025-06-18",
				labels: [],
				dependencies: [],
				description: "State in different milestone",
				milestone: "Release-2",
			},
			false,
		);

		await core.createState(
			{
				id: "state-4",
				title: "No milestone state",
				status: "To Do",
				assignee: [],
				createdDate: "2025-06-18",
				labels: [],
				dependencies: [],
				description: "State without milestone",
			},
			false,
		);

		await core.createState(
			{
				id: "state-5",
				title: "Roadmap milestone state",
				status: "To Do",
				assignee: [],
				createdDate: "2025-06-18",
				labels: [],
				dependencies: [],
				description: "State in roadmap milestone",
				milestone: "Roadmap Alpha",
			},
			false,
		);

		await core.createState(
			{
				id: "state-6",
				title: "ID milestone state",
				status: "To Do",
				assignee: [],
				createdDate: "2025-06-18",
				labels: [],
				dependencies: [],
				description: "State with milestone stored as ID",
				milestone: newMilestone.id,
			},
			false,
		);
	});

	afterEach(async () => {
		try {
			await safeCleanup(TEST_DIR);
		} catch {
			// Ignore cleanup errors - unique directory names prevent conflicts
		}
	});

	it("filters by milestone with case-insensitive matching", async () => {
		const result = await $`bun ${cliPath} state list --milestone RELEASE-1 --plain`.cwd(TEST_DIR).quiet();

		expect(result.exitCode).toBe(0);
		const output = result.stdout.toString();

		expect(output).toContain("STATE-1 - Milestone state one");
		expect(output).toContain("STATE-2 - Milestone state two");
		expect(output).not.toContain("STATE-3 - Other milestone state");
		expect(output).not.toContain("STATE-4 - No milestone state");
		expect(output).not.toContain("STATE-5 - Roadmap milestone state");
		expect(output).not.toContain("STATE-6 - ID milestone state");
	});

	it("supports -m shorthand and combines milestone with status filter", async () => {
		const result = await $`bun ${cliPath} state list -m release-1 --status "To Do" --plain`.cwd(TEST_DIR).quiet();

		expect(result.exitCode).toBe(0);
		const output = result.stdout.toString();

		expect(output).toContain("STATE-1 - Milestone state one");
		expect(output).not.toContain("STATE-2 - Milestone state two");
		expect(output).not.toContain("STATE-3 - Other milestone state");
		expect(output).not.toContain("STATE-4 - No milestone state");
		expect(output).not.toContain("STATE-5 - Roadmap milestone state");
		expect(output).not.toContain("STATE-6 - ID milestone state");
	});

	it("matches closest milestone for partial and typo inputs", async () => {
		const typoResult = await $`bun ${cliPath} state list --milestone releas-1 --plain`.cwd(TEST_DIR).quiet();
		expect(typoResult.exitCode).toBe(0);
		const typoOutput = typoResult.stdout.toString();

		expect(typoOutput).toContain("STATE-1 - Milestone state one");
		expect(typoOutput).toContain("STATE-2 - Milestone state two");
		expect(typoOutput).not.toContain("STATE-3 - Other milestone state");
		expect(typoOutput).not.toContain("STATE-4 - No milestone state");
		expect(typoOutput).not.toContain("STATE-5 - Roadmap milestone state");

		const partialResult = await $`bun ${cliPath} state list --milestone roadmp --plain`.cwd(TEST_DIR).quiet();
		expect(partialResult.exitCode).toBe(0);
		const partialOutput = partialResult.stdout.toString();

		expect(partialOutput).toContain("STATE-5 - Roadmap milestone state");
		expect(partialOutput).not.toContain("STATE-1 - Milestone state one");
		expect(partialOutput).not.toContain("STATE-2 - Milestone state two");
		expect(partialOutput).not.toContain("STATE-3 - Other milestone state");
		expect(partialOutput).not.toContain("STATE-4 - No milestone state");
		expect(partialOutput).not.toContain("STATE-6 - ID milestone state");
	});

	it("matches milestone title when states store milestone IDs", async () => {
		const result = await $`bun ${cliPath} state list -m new --plain`.cwd(TEST_DIR).quiet();
		expect(result.exitCode).toBe(0);
		const output = result.stdout.toString();

		expect(output).toContain("STATE-6 - ID milestone state");
		expect(output).not.toContain("STATE-1 - Milestone state one");
		expect(output).not.toContain("STATE-2 - Milestone state two");
		expect(output).not.toContain("STATE-3 - Other milestone state");
		expect(output).not.toContain("STATE-4 - No milestone state");
		expect(output).not.toContain("STATE-5 - Roadmap milestone state");
	});

	it("preserves existing listing behavior when milestone filter is omitted", async () => {
		const result = await $`bun ${cliPath} state list --plain`.cwd(TEST_DIR).quiet();

		expect(result.exitCode).toBe(0);
		const output = result.stdout.toString();

		expect(output).toContain("STATE-1 - Milestone state one");
		expect(output).toContain("STATE-2 - Milestone state two");
		expect(output).toContain("STATE-3 - Other milestone state");
		expect(output).toContain("STATE-4 - No milestone state");
		expect(output).toContain("STATE-5 - Roadmap milestone state");
		expect(output).toContain("STATE-6 - ID milestone state");
	});
});
