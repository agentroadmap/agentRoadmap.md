import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { $ } from "bun";
import { Core } from "../core/roadmap.ts";
import type { RoadmapConfig } from "../types/index.ts";

describe("Offline Integration Tests", () => {
	let tempDir: string;
	let core: Core;

	beforeEach(async () => {
		tempDir = await mkdtemp(join(tmpdir(), "roadmap-offline-integration-"));

		// Initialize a git repo without remote
		await $`git init`.cwd(tempDir).quiet();
		await $`git config user.email test@example.com`.cwd(tempDir).quiet();
		await $`git config user.name "Test User"`.cwd(tempDir).quiet();

		// Create initial commit
		await writeFile(join(tempDir, "README.md"), "# Test Project");
		await $`git add README.md`.cwd(tempDir).quiet();
		await $`git commit -m "Initial commit"`.cwd(tempDir).quiet();

		// Create basic roadmap structure
		const roadmapDir = join(tempDir, "roadmap");
		await mkdir(roadmapDir, { recursive: true });
		await mkdir(join(roadmapDir, "nodes"), { recursive: true });
		await mkdir(join(roadmapDir, "drafts"), { recursive: true });

		// Create config with remote operations disabled
		const config: RoadmapConfig = {
			projectName: "Offline Test Project",
			statuses: ["To Do", "In Progress", "Done"],
			labels: ["bug", "feature"],
			milestones: [],
			dateFormat: "YYYY-MM-DD",
			remoteOperations: false,
		};

		await writeFile(
			join(roadmapDir, "config.yml"),
			`project_name: "${config.projectName}"
statuses: ["To Do", "In Progress", "Done"]
labels: ["bug", "feature"]
milestones: []
date_format: YYYY-MM-DD
roadmap_directory: "roadmap"
remote_operations: false
`,
		);

		core = new Core(tempDir);
	});

	afterEach(async () => {
		if (tempDir) {
			await rm(tempDir, { recursive: true, force: true });
		}
	});

	it("should work in offline mode without remote", async () => {
		// Ensure config migration works with remoteOperations
		await core.ensureConfigMigrated();
		const config = await core.filesystem.loadConfig();
		expect(config?.remoteOperations).toBe(false);

		// Create a state - this should work without any remote operations
		const state = {
			id: "state-1",
			title: "Test state in offline mode",
			description: "This state should be created without remote operations",
			status: "To Do",
			assignee: [],
			createdDate: new Date().toISOString().split("T")[0] ?? "",
			updatedDate: new Date().toISOString().split("T")[0] ?? "",
			labels: ["feature"],
			dependencies: [],
			priority: "medium" as const,
		};

		const filepath = await core.createState(state);
		expect(filepath).toContain("state-1");

		// List states should work without remote operations
		const states = await core.listStatesWithMetadata();
		expect(states).toHaveLength(1);
		expect(states[0]?.id).toBe("STATE-1");
		expect(states[0]?.title).toBe("Test state in offline mode");
	});

	it("should handle state ID generation in offline mode", async () => {
		// Create multiple states to test ID generation
		const state1 = {
			id: "state-1",
			title: "First state",
			description: "First state description",
			status: "To Do",
			assignee: [],
			createdDate: new Date().toISOString().split("T")[0] ?? "",
			updatedDate: new Date().toISOString().split("T")[0] ?? "",
			labels: [],
			dependencies: [],
			priority: "medium" as const,
		};

		const state2 = {
			id: "state-2",
			title: "Second state",
			description: "Second state description",
			status: "In Progress",
			assignee: [],
			createdDate: new Date().toISOString().split("T")[0] ?? "",
			updatedDate: new Date().toISOString().split("T")[0] ?? "",
			labels: [],
			dependencies: [],
			priority: "high" as const,
		};

		await core.createState(state1);
		await core.createState(state2);

		const states = await core.listStatesWithMetadata();
		expect(states).toHaveLength(2);

		const stateIds = states.map((t) => t.id);
		expect(stateIds).toContain("STATE-1");
		expect(stateIds).toContain("STATE-2");
	});

	it("should handle repository without remote origin gracefully", async () => {
		// Try to verify that git operations don't fail when there's no remote
		// This simulates a local-only git repository

		// Get git operations instance
		const gitOps = await core.getGitOps();

		// These operations should not fail even without remote
		try {
			await gitOps.fetch();
			// Should complete without error due to remoteOperations: false
		} catch (error) {
			// If it does error, it should be handled gracefully
			expect(error).toBeUndefined();
		}

		// Verify that we can still work with local git operations
		const lastCommit = await gitOps.getLastCommitMessage();
		// Should be empty or the initial commit
		expect(typeof lastCommit).toBe("string");
	});

	it("should work with config command to set remoteOperations", async () => {
		// Load initial config
		const initialConfig = await core.filesystem.loadConfig();
		expect(initialConfig?.remoteOperations).toBe(false);

		// Simulate config set command
		if (!initialConfig) throw new Error("Config not loaded");
		const updatedConfig: RoadmapConfig = { ...initialConfig, remoteOperations: true };
		await core.filesystem.saveConfig(updatedConfig);

		// Verify config was updated
		const newConfig = await core.filesystem.loadConfig();
		expect(newConfig?.remoteOperations).toBe(true);

		// Test changing it back
		if (!newConfig) throw new Error("Config not loaded");
		const finalConfig: RoadmapConfig = { ...newConfig, remoteOperations: false };
		await core.filesystem.saveConfig(finalConfig);

		const verifyConfig = await core.filesystem.loadConfig();
		expect(verifyConfig?.remoteOperations).toBe(false);
	});

	it("should migrate existing configs to include remoteOperations", async () => {
		// Create a config without remoteOperations field
		const roadmapDir = join(tempDir, "roadmap");
		await writeFile(
			join(roadmapDir, "config.yml"),
			`project_name: "Legacy Project"
statuses: ["To Do", "Done"]
labels: []
milestones: []
date_format: YYYY-MM-DD
roadmap_directory: "roadmap"
`,
		);

		// Create new Core instance to trigger migration
		const legacyCore = new Core(tempDir);
		await legacyCore.ensureConfigMigrated();

		// Verify that remoteOperations was added with default value
		const migratedConfig = await legacyCore.filesystem.loadConfig();
		expect(migratedConfig?.remoteOperations).toBe(true); // Default should be true
		expect(migratedConfig?.projectName).toBe("Legacy Project");
	});

	it("should handle loadRemoteStates in offline mode", async () => {
		const config = await core.filesystem.loadConfig();
		expect(config?.remoteOperations).toBe(false);

		// Import loadRemoteStates
		const { loadRemoteStates } = await import("../core/state-loader.ts");

		const progressMessages: string[] = [];
		const remoteStates = await loadRemoteStates(core.gitOps, config, (msg: string) => progressMessages.push(msg));

		// Should return empty array and skip remote operations
		expect(remoteStates).toEqual([]);
		expect(progressMessages).toContain("Remote operations disabled - skipping remote states");
	});
});
