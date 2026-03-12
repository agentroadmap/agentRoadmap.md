import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { $ } from "bun";
import { Core } from "../index.ts";
import { createStatePlatformAware, getCliHelpPlatformAware } from "./test-helpers.ts";

describe("CLI parent shorthand option", () => {
	let testDir: string;

	beforeAll(async () => {
		testDir = await mkdtemp(join(tmpdir(), "roadmap-test-"));

		// Initialize git repository first to avoid interactive prompts
		await $`git init -b main`.cwd(testDir).quiet();
		await $`git config user.name "Test User"`.cwd(testDir).quiet();
		await $`git config user.email test@example.com`.cwd(testDir).quiet();

		// Initialize roadmap project using Core (simulating CLI)
		const core = new Core(testDir);
		await core.initializeProject("Test Project");
	});

	afterAll(async () => {
		await rm(testDir, { recursive: true, force: true });
	});

	it("should accept -p as shorthand for --parent", async () => {
		// Create parent state
		const createParent = await createStatePlatformAware({ title: "Parent State" }, testDir);
		expect(createParent.exitCode).toBe(0);

		// Create substate using -p shorthand
		const createSubstateShort = await createStatePlatformAware({ title: "Substate with -p", parent: "state-1" }, testDir);
		expect(createSubstateShort.exitCode).toBe(0);

		// Find the created substate file
		const statesDir = join(testDir, "roadmap", "nodes");
		const files = await readdir(statesDir);
		const substateFiles = files.filter((f) => f.startsWith("state-1.1 - ") && f.endsWith(".md"));
		expect(substateFiles.length).toBe(1);

		// Verify the substate was created with correct parent
		if (substateFiles[0]) {
			const substateFile = await Bun.file(join(statesDir, substateFiles[0])).text();
			expect(substateFile).toContain("parent_state_id: STATE-1");
		}
	});

	it("should work the same as --parent option", async () => {
		// Create substate using --parent
		const createSubstateLong = await createStatePlatformAware(
			{ title: "Substate with --parent", parent: "state-1" },
			testDir,
		);
		expect(createSubstateLong.exitCode).toBe(0);

		// Find both substate files
		const statesDir = join(testDir, "roadmap", "nodes");
		const files = await readdir(statesDir);
		const substateFiles1 = files.filter((f) => f.startsWith("state-1.1 - ") && f.endsWith(".md"));
		const substateFiles2 = files.filter((f) => f.startsWith("state-1.2 - ") && f.endsWith(".md"));

		expect(substateFiles1.length).toBe(1);
		expect(substateFiles2.length).toBe(1);

		// Verify both substates have the same parent
		if (substateFiles1[0] && substateFiles2[0]) {
			const substate1 = await Bun.file(join(statesDir, substateFiles1[0])).text();
			const substate2 = await Bun.file(join(statesDir, substateFiles2[0])).text();

			expect(substate1).toContain("parent_state_id: STATE-1");
			expect(substate2).toContain("parent_state_id: STATE-1");
		}
	});

	it("should show -p in help text", async () => {
		const helpResult = await getCliHelpPlatformAware(["state", "create", "--help"], testDir);

		expect(helpResult.stdout).toContain("-p, --parent <stateId>");
		expect(helpResult.stdout).toContain("specify parent state ID");
	});

	it("should show Definition of Done options in help text", async () => {
		const helpResult = await getCliHelpPlatformAware(["state", "create", "--help"], testDir);

		expect(helpResult.stdout).toContain("--dod <item>");
		expect(helpResult.stdout).toContain("--no-dod-defaults");
	});
});
