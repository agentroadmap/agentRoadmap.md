import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { $ } from "bun";
import { Core } from "../core/roadmap.ts";
import type { RoadmapConfig, State } from "../types/index.ts";
import { createUniqueTestDir, safeCleanup } from "./test-utils.ts";

let TEST_DIR: string;

describe("Auto-commit configuration", () => {
	let core: Core;

	beforeEach(async () => {
		TEST_DIR = createUniqueTestDir("test-auto-commit");
		await rm(TEST_DIR, { recursive: true, force: true }).catch(() => {});
		await mkdir(TEST_DIR, { recursive: true });

		// Configure git for tests
		await $`git init`.cwd(TEST_DIR).quiet();
		await $`git config user.email test@example.com`.cwd(TEST_DIR).quiet();
		await $`git config user.name "Test User"`.cwd(TEST_DIR).quiet();

		core = new Core(TEST_DIR);
		await core.initializeProject("Test Auto-commit Project", true);
	});

	afterEach(async () => {
		try {
			await safeCleanup(TEST_DIR);
		} catch {
			// Ignore cleanup errors - the unique directory names prevent conflicts
		}
	});

	describe("Config migration", () => {
		it("should include autoCommit in default config with false value", async () => {
			const config = await core.filesystem.loadConfig();
			expect(config).toBeDefined();
			expect(config?.autoCommit).toBe(false);
		});

		it("should migrate existing config to include autoCommit", async () => {
			// Create config without autoCommit
			const oldConfig: RoadmapConfig = {
				projectName: "Test Project",
				statuses: ["To Do", "Done"],
				labels: [],
				milestones: [],
				dateFormat: "yyyy-mm-dd",
			};
			await core.filesystem.saveConfig(oldConfig);

			// Trigger migration
			await core.ensureConfigMigrated();

			const migratedConfig = await core.filesystem.loadConfig();
			expect(migratedConfig).toBeDefined();
			expect(migratedConfig?.autoCommit).toBe(false);
		});
	});

	describe("Core operations with autoCommit disabled", () => {
		beforeEach(async () => {
			// Set autoCommit to false
			const config = await core.filesystem.loadConfig();
			if (config) {
				config.autoCommit = false;
				await core.filesystem.saveConfig(config);
			}
		});

		it("should not auto-commit when creating state with autoCommit disabled in config", async () => {
			const state: State = {
				id: "state-1",
				title: "Test State",
				status: "To Do",
				assignee: [],
				createdDate: "2025-07-07",
				labels: [],
				dependencies: [],
				description: "Test description",
			};

			await core.createState(state);

			// Check that there are uncommitted changes
			const git = await core.getGitOps();
			const isClean = await git.isClean();
			expect(isClean).toBe(false);
		});

		it("should auto-commit when explicitly passing true to createState", async () => {
			const state: State = {
				id: "state-2",
				title: "Test State 2",
				status: "To Do",
				assignee: [],
				createdDate: "2025-07-07",
				labels: [],
				dependencies: [],
				description: "Test description",
			};

			await core.createState(state, true);

			// Check that working directory is clean (changes were committed)
			const git = await core.getGitOps();
			const isClean = await git.isClean();
			expect(isClean).toBe(true);
		});

		it("should not auto-commit when updating state with autoCommit disabled in config", async () => {
			// First create a state with explicit commit
			const state: State = {
				id: "state-3",
				title: "Test State",
				status: "To Do",
				assignee: [],
				createdDate: "2025-07-07",
				labels: [],
				dependencies: [],
				description: "Test description",
			};
			await core.createState(state, true);

			// Update the state (should not auto-commit)
			await core.updateStateFromInput("state-3", { title: "Updated State" });

			// Check that there are uncommitted changes
			const git = await core.getGitOps();
			const isClean = await git.isClean();
			expect(isClean).toBe(false);
		});

		it("should not auto-commit when archiving state with autoCommit disabled in config", async () => {
			// First create a state with explicit commit
			const state: State = {
				id: "state-4",
				title: "Test State",
				status: "To Do",
				assignee: [],
				createdDate: "2025-07-07",
				labels: [],
				dependencies: [],
				description: "Test description",
			};
			await core.createState(state, true);

			// Archive the state (should not auto-commit)
			await core.archiveState("state-4");

			// Check that there are uncommitted changes
			const git = await core.getGitOps();
			const isClean = await git.isClean();
			expect(isClean).toBe(false);
		});
	});

	describe("Core operations with autoCommit enabled", () => {
		beforeEach(async () => {
			// Set autoCommit to true
			const config = await core.filesystem.loadConfig();
			if (config) {
				config.autoCommit = true;
				await core.filesystem.saveConfig(config);
			}

			// Commit the config change to start with a clean state
			const git = await core.getGitOps();
			await git.addFile(join(TEST_DIR, "roadmap", "config.yml"));
			await git.commitChanges("Update autoCommit config for test");
		});

		it("should auto-commit when creating state with autoCommit enabled in config", async () => {
			const state: State = {
				id: "state-5",
				title: "Test State",
				status: "To Do",
				assignee: [],
				createdDate: "2025-07-07",
				labels: [],
				dependencies: [],
				description: "Test description",
			};

			await core.createState(state);

			// Check that working directory is clean (changes were committed)
			const git = await core.getGitOps();
			const isClean = await git.isClean();
			expect(isClean).toBe(true);
		});

		it("should not auto-commit when explicitly passing false to createState", async () => {
			const state: State = {
				id: "state-6",
				title: "Test State",
				status: "To Do",
				assignee: [],
				createdDate: "2025-07-07",
				labels: [],
				dependencies: [],
				description: "Test description",
			};

			await core.createState(state, false);

			// Check that there are uncommitted changes
			const git = await core.getGitOps();
			const isClean = await git.isClean();
			expect(isClean).toBe(false);
		});

		it("should auto-commit archive cleanup updates when archiving a state", async () => {
			const archiveTarget: State = {
				id: "state-7",
				title: "Archive target",
				status: "To Do",
				assignee: [],
				createdDate: "2025-07-07",
				labels: [],
				dependencies: [],
				description: "State to archive",
			};

			const dependentState: State = {
				id: "state-8",
				title: "Dependent state",
				status: "To Do",
				assignee: [],
				createdDate: "2025-07-07",
				labels: [],
				dependencies: ["state-7"],
				references: ["STATE-7", "https://example.com/states/state-7"],
				description: "State that references archive target",
			};

			await core.createState(archiveTarget);
			await core.createState(dependentState);
			await core.archiveState("state-7");

			const updatedState = await core.filesystem.loadState("state-8");
			expect(updatedState?.dependencies).toEqual([]);
			expect(updatedState?.references).toEqual(["https://example.com/states/state-7"]);

			const git = await core.getGitOps();
			const isClean = await git.isClean();
			expect(isClean).toBe(true);
		});
	});

	describe("Draft operations", () => {
		beforeEach(async () => {
			// Set autoCommit to false
			const config = await core.filesystem.loadConfig();
			if (config) {
				config.autoCommit = false;
				await core.filesystem.saveConfig(config);
			}
		});

		it("should respect autoCommit config for draft operations", async () => {
			const state: State = {
				id: "draft-1",
				title: "Test Draft",
				status: "Draft",
				assignee: [],
				createdDate: "2025-07-07",
				labels: [],
				dependencies: [],
				description: "Test description",
			};

			await core.createDraft(state);

			// Check that there are uncommitted changes
			const git = await core.getGitOps();
			const isClean = await git.isClean();
			expect(isClean).toBe(false);
		});

		it("should respect autoCommit config for promote draft operations", async () => {
			// First create a draft with explicit commit
			const state: State = {
				id: "draft-2",
				title: "Test Draft",
				status: "Draft",
				assignee: [],
				createdDate: "2025-07-07",
				labels: [],
				dependencies: [],
				description: "Test description",
			};
			await core.createDraft(state, true);

			// Promote the draft (should not auto-commit)
			await core.promoteDraft("draft-2");

			// Check that there are uncommitted changes
			const git = await core.getGitOps();
			const isClean = await git.isClean();
			expect(isClean).toBe(false);
		});
	});
});
