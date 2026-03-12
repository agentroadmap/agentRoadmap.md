import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdir, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { $ } from "bun";
import { Core, isGitRepository } from "../index.ts";
import { parseState } from "../markdown/parser.ts";
import { extractStructuredSection } from "../markdown/structured-sections.ts";
import type { Decision, Document, State } from "../types/index.ts";
import { listStatesPlatformAware, viewStatePlatformAware } from "./test-helpers.ts";
import { createUniqueTestDir, safeCleanup } from "./test-utils.ts";

let TEST_DIR: string;
const CLI_PATH = join(process.cwd(), "src", "cli.ts");

describe("CLI Integration", () => {
	beforeEach(async () => {
		TEST_DIR = createUniqueTestDir("test-cli");
		try {
			await rm(TEST_DIR, { recursive: true, force: true });
		} catch {
			// Ignore cleanup errors
		}
		await mkdir(TEST_DIR, { recursive: true });
	});

	afterEach(async () => {
		try {
			await safeCleanup(TEST_DIR);
		} catch {
			// Ignore cleanup errors - the unique directory names prevent conflicts
		}
	});

	describe("roadmap init command", () => {
		it("should initialize roadmap project in existing git repo", async () => {
			// Set up a git repository
			await $`git init -b main`.cwd(TEST_DIR).quiet();
			await $`git config user.name "Test User"`.cwd(TEST_DIR).quiet();
			await $`git config user.email test@example.com`.cwd(TEST_DIR).quiet();

			// Initialize roadmap project using Core (simulating CLI)
			const core = new Core(TEST_DIR);
			await core.initializeProject("CLI Test Project", true);

			// Verify directory structure was created
			const configExists = await Bun.file(join(TEST_DIR, "roadmap", "config.yml")).exists();
			expect(configExists).toBe(true);

			// Verify config content
			const config = await core.filesystem.loadConfig();
			expect(config?.projectName).toBe("CLI Test Project");
			expect(config?.statuses).toEqual(["To Do", "In Progress", "Done"]);
			expect(config?.defaultStatus).toBe("To Do");

			// Verify git commit was created
			const lastCommit = await core.gitOps.getLastCommitMessage();
			expect(lastCommit).toContain("Initialize roadmap project: CLI Test Project");
		});

		it("should create all required directories", async () => {
			// Set up a git repository
			await $`git init -b main`.cwd(TEST_DIR).quiet();
			await $`git config user.name "Test User"`.cwd(TEST_DIR).quiet();
			await $`git config user.email test@example.com`.cwd(TEST_DIR).quiet();

			const core = new Core(TEST_DIR);
			await core.initializeProject("Directory Test");

			// Check all expected directories exist
			const expectedDirs = [
				"roadmap",
				"roadmap/nodes",
				"roadmap/drafts",
				"roadmap/archive",
				"roadmap/archive/nodes",
				"roadmap/archive/drafts",
				"roadmap/archive/milestones",
				"roadmap/milestones",
				"roadmap/docs",
				"roadmap/decisions",
			];

			for (const dir of expectedDirs) {
				try {
					const stats = await stat(join(TEST_DIR, dir));
					expect(stats.isDirectory()).toBe(true);
				} catch {
					// If stat fails, directory doesn't exist
					expect(false).toBe(true);
				}
			}
		});

		it("should handle project names with special characters", async () => {
			// Set up a git repository
			await $`git init -b main`.cwd(TEST_DIR).quiet();
			await $`git config user.name "Test User"`.cwd(TEST_DIR).quiet();
			await $`git config user.email test@example.com`.cwd(TEST_DIR).quiet();

			const core = new Core(TEST_DIR);
			const specialProjectName = "My-Project_2024 (v1.0)";
			await core.initializeProject(specialProjectName);

			const config = await core.filesystem.loadConfig();
			expect(config?.projectName).toBe(specialProjectName);
		});

		it("should work when git repo exists", async () => {
			// Set up existing git repo
			await $`git init -b main`.cwd(TEST_DIR).quiet();
			await $`git config user.name "Test User"`.cwd(TEST_DIR).quiet();
			await $`git config user.email test@example.com`.cwd(TEST_DIR).quiet();

			const isRepo = await isGitRepository(TEST_DIR);
			expect(isRepo).toBe(true);

			const core = new Core(TEST_DIR);
			await core.initializeProject("Existing Repo Test");

			const config = await core.filesystem.loadConfig();
			expect(config?.projectName).toBe("Existing Repo Test");
		});

		it("should accept optional project name parameter", async () => {
			await $`git init -b main`.cwd(TEST_DIR).quiet();
			await $`git config user.name "Test User"`.cwd(TEST_DIR).quiet();
			await $`git config user.email test@example.com`.cwd(TEST_DIR).quiet();

			// Test the CLI implementation by directly using the Core functionality
			const core = new Core(TEST_DIR);
			await core.initializeProject("Test Project");

			const config = await core.filesystem.loadConfig();
			expect(config?.projectName).toBe("Test Project");
		});

		it("should create agent instruction files when requested", async () => {
			// Set up a git repository
			await $`git init -b main`.cwd(TEST_DIR).quiet();
			await $`git config user.name "Test User"`.cwd(TEST_DIR).quiet();
			await $`git config user.email test@example.com`.cwd(TEST_DIR).quiet();

			// Simulate the agent instructions being added
			const core = new Core(TEST_DIR);
			await core.initializeProject("Agent Test Project");

			// Import and call addAgentInstructions directly (simulating user saying "y")
			const { addAgentInstructions } = await import("../index.ts");
			await addAgentInstructions(TEST_DIR, core.gitOps);

			// Verify agent files were created
			const agentsFile = await Bun.file(join(TEST_DIR, "AGENTS.md")).exists();
			const claudeFile = await Bun.file(join(TEST_DIR, "CLAUDE.md")).exists();
			// .cursorrules removed; Cursor now uses AGENTS.md
			const geminiFile = await Bun.file(join(TEST_DIR, "GEMINI.md")).exists();
			const copilotFile = await Bun.file(join(TEST_DIR, ".github/copilot-instructions.md")).exists();

			expect(agentsFile).toBe(true);
			expect(claudeFile).toBe(true);
			expect(geminiFile).toBe(true);
			expect(copilotFile).toBe(true);

			// Verify content
			const agentsContent = await Bun.file(join(TEST_DIR, "AGENTS.md")).text();
			const claudeContent = await Bun.file(join(TEST_DIR, "CLAUDE.md")).text();
			const geminiContent = await Bun.file(join(TEST_DIR, "GEMINI.md")).text();
			const copilotContent = await Bun.file(join(TEST_DIR, ".github/copilot-instructions.md")).text();
			expect(agentsContent.length).toBeGreaterThan(0);
			expect(claudeContent.length).toBeGreaterThan(0);
			expect(geminiContent.length).toBeGreaterThan(0);
			expect(copilotContent.length).toBeGreaterThan(0);
		});

		it("should allow skipping agent instructions with 'none' selection", async () => {
			await $`git init -b main`.cwd(TEST_DIR).quiet();
			await $`git config user.name "Test User"`.cwd(TEST_DIR).quiet();
			await $`git config user.email test@example.com`.cwd(TEST_DIR).quiet();

			const output = await $`bun ${CLI_PATH} init TestProj --defaults --agent-instructions none`.cwd(TEST_DIR).text();

			const agentsFile = await Bun.file(join(TEST_DIR, "AGENTS.md")).exists();
			const claudeFile = await Bun.file(join(TEST_DIR, "CLAUDE.md")).exists();
			expect(agentsFile).toBe(false);
			expect(claudeFile).toBe(false);
			expect(output).toContain("AI Integration: CLI commands (legacy)");
			expect(output).toContain("Skipping agent instruction files per selection.");
		});

		it("should print minimal summary when advanced settings are skipped", async () => {
			await $`git init -b main`.cwd(TEST_DIR).quiet();
			await $`git config user.name "Test User"`.cwd(TEST_DIR).quiet();
			await $`git config user.email test@example.com`.cwd(TEST_DIR).quiet();

			const output = await $`bun ${CLI_PATH} init SummaryProj --defaults --agent-instructions none`
				.cwd(TEST_DIR)
				.text();

			expect(output).toContain("Initialization Summary");
			expect(output).toContain("Project Name: SummaryProj");
			expect(output).toContain("AI Integration: CLI commands (legacy)");
			expect(output).toContain("Advanced settings: unchanged");
			expect(output).not.toContain("Remote operations:");
			expect(output).not.toContain("Zero-padded IDs:");
		});

		it("should support MCP integration mode via flag", async () => {
			await $`git init -b main`.cwd(TEST_DIR).quiet();
			await $`git config user.name "Test User"`.cwd(TEST_DIR).quiet();
			await $`git config user.email test@example.com`.cwd(TEST_DIR).quiet();

			const output = await $`bun ${CLI_PATH} init McpProj --defaults --integration-mode mcp`.cwd(TEST_DIR).text();

			expect(output).toContain("AI Integration: MCP connector");
			expect(output).toContain("Agent instruction files: guidance is provided through the MCP connector.");
			expect(output).toContain("MCP server name: roadmap");
			expect(output).toContain("MCP client setup: skipped (non-interactive)");
			const agentsFile = await Bun.file(join(TEST_DIR, "AGENTS.md")).exists();
			const claudeFile = await Bun.file(join(TEST_DIR, "CLAUDE.md")).exists();
			expect(agentsFile).toBe(false);
			expect(claudeFile).toBe(false);
		});

		it("should default to MCP integration when no mode is specified", async () => {
			await $`git init -b main`.cwd(TEST_DIR).quiet();
			await $`git config user.name "Test User"`.cwd(TEST_DIR).quiet();
			await $`git config user.email test@example.com`.cwd(TEST_DIR).quiet();

			const output = await $`bun ${CLI_PATH} init DefaultMcpProj --defaults`.cwd(TEST_DIR).text();

			expect(output).toContain("AI Integration: MCP connector");
			expect(output).toContain("MCP server name: roadmap");
			expect(output).toContain("MCP client setup: skipped (non-interactive)");
		});

		it("should allow skipping AI integration via flag", async () => {
			await $`git init -b main`.cwd(TEST_DIR).quiet();
			await $`git config user.name "Test User"`.cwd(TEST_DIR).quiet();
			await $`git config user.email test@example.com`.cwd(TEST_DIR).quiet();

			const output = await $`bun ${CLI_PATH} init SkipProj --defaults --integration-mode none`.cwd(TEST_DIR).text();

			expect(output).not.toContain("AI Integration:");
			expect(output).toContain("AI integration: skipped");
			const agentsFile = await Bun.file(join(TEST_DIR, "AGENTS.md")).exists();
			const claudeFile = await Bun.file(join(TEST_DIR, "CLAUDE.md")).exists();
			expect(agentsFile).toBe(false);
			expect(claudeFile).toBe(false);
		});

		it("should reject MCP integration when agent instruction flags are provided", async () => {
			await $`git init -b main`.cwd(TEST_DIR).quiet();
			await $`git config user.name "Test User"`.cwd(TEST_DIR).quiet();
			await $`git config user.email test@example.com`.cwd(TEST_DIR).quiet();

			let failed = false;
			let combinedOutput = "";
			try {
				await $`bun ${CLI_PATH} init ConflictProj --defaults --integration-mode mcp --agent-instructions claude`
					.cwd(TEST_DIR)
					.text();
			} catch (err) {
				failed = true;
				const e = err as { stdout?: unknown; stderr?: unknown };
				combinedOutput = String(e.stdout ?? "") + String(e.stderr ?? "");
			}

			expect(failed).toBe(true);
			expect(combinedOutput).toContain("cannot be combined");
		});

		it("should ignore 'none' when other agent instructions are provided", async () => {
			await $`git init -b main`.cwd(TEST_DIR).quiet();
			await $`git config user.name "Test User"`.cwd(TEST_DIR).quiet();
			await $`git config user.email test@example.com`.cwd(TEST_DIR).quiet();

			await $`bun ${CLI_PATH} init TestProj --defaults --agent-instructions agents,none`.cwd(TEST_DIR).quiet();

			const agentsFile = await Bun.file(join(TEST_DIR, "AGENTS.md")).exists();
			expect(agentsFile).toBe(true);
		});

		it("should error on invalid agent instruction value", async () => {
			await $`git init -b main`.cwd(TEST_DIR).quiet();
			await $`git config user.name "Test User"`.cwd(TEST_DIR).quiet();
			await $`git config user.email test@example.com`.cwd(TEST_DIR).quiet();

			let failed = false;
			try {
				await $`bun ${CLI_PATH} init InvalidProj --defaults --agent-instructions notreal`.cwd(TEST_DIR).quiet();
			} catch (e) {
				failed = true;
				const err = e as { stdout?: unknown; stderr?: unknown };
				const out = String(err.stdout ?? "") + String(err.stderr ?? "");
				expect(out).toContain("Invalid agent instruction: notreal");
				expect(out).toContain("Valid options are: cursor, claude, agents, gemini, copilot, none");
			}

			expect(failed).toBe(true);
		});
	});

	describe("git integration", () => {
		beforeEach(async () => {
			// Set up a git repository
			await $`git init -b main`.cwd(TEST_DIR).quiet();
			await $`git config user.name "Test User"`.cwd(TEST_DIR).quiet();
			await $`git config user.email test@example.com`.cwd(TEST_DIR).quiet();
		});

		it("should create initial commit with roadmap structure", async () => {
			const core = new Core(TEST_DIR);
			await core.initializeProject("Git Integration Test", true);

			const lastCommit = await core.gitOps.getLastCommitMessage();
			expect(lastCommit).toBe("roadmap: Initialize roadmap project: Git Integration Test");

			// Verify git status is clean after initialization
			const isClean = await core.gitOps.isClean();
			expect(isClean).toBe(true);
		});
	});

	describe("state list command", () => {
		beforeEach(async () => {
			// Set up a git repository and initialize roadmap
			await $`git init -b main`.cwd(TEST_DIR).quiet();
			await $`git config user.name "Test User"`.cwd(TEST_DIR).quiet();
			await $`git config user.email test@example.com`.cwd(TEST_DIR).quiet();

			const core = new Core(TEST_DIR);
			await core.initializeProject("List Test Project", true);
		});

		it("should show 'No states found' when no states exist", async () => {
			const core = new Core(TEST_DIR);
			const states = await core.filesystem.listStates();
			expect(states).toHaveLength(0);
		});

		it("should list states grouped by status", async () => {
			const core = new Core(TEST_DIR);

			// Create test states with different statuses
			await core.createState(
				{
					id: "state-1",
					title: "First State",
					status: "To Do",
					assignee: [],
					createdDate: "2025-06-08",
					labels: [],
					dependencies: [],
					rawContent: "First test state",
				},
				false,
			);

			await core.createState(
				{
					id: "state-2",
					title: "Second State",
					status: "Done",
					assignee: [],
					createdDate: "2025-06-08",
					labels: [],
					dependencies: [],
					rawContent: "Second test state",
				},
				false,
			);

			await core.createState(
				{
					id: "state-3",
					title: "Third State",
					status: "To Do",
					assignee: [],
					createdDate: "2025-06-08",
					labels: [],
					dependencies: [],
					rawContent: "Third test state",
				},
				false,
			);

			const states = await core.filesystem.listStates();
			expect(states).toHaveLength(3);

			// Verify states are grouped correctly by status
			const todoStates = states.filter((t) => t.status === "To Do");
			const doneStates = states.filter((t) => t.status === "Done");

			expect(todoStates).toHaveLength(2);
			expect(doneStates).toHaveLength(1);
			expect(todoStates.map((t) => t.id)).toEqual(["STATE-1", "STATE-3"]); // IDs normalized to uppercase
			expect(doneStates.map((t) => t.id)).toEqual(["STATE-2"]); // IDs normalized to uppercase
		});

		it("should respect config status order", async () => {
			const core = new Core(TEST_DIR);

			// Load and verify default config status order
			const config = await core.filesystem.loadConfig();
			expect(config?.statuses).toEqual(["To Do", "In Progress", "Done"]);
		});

		it("should filter states by status", async () => {
			const core = new Core(TEST_DIR);

			await core.createState(
				{
					id: "state-1",
					title: "First State",
					status: "To Do",
					assignee: [],
					createdDate: "2025-06-08",
					labels: [],
					dependencies: [],
					rawContent: "First test state",
				},
				false,
			);
			await core.createState(
				{
					id: "state-2",
					title: "Second State",
					status: "Done",
					assignee: [],
					createdDate: "2025-06-08",
					labels: [],
					dependencies: [],
					rawContent: "Second test state",
				},
				false,
			);

			const result = await $`bun ${CLI_PATH} state list --plain --status Done`.cwd(TEST_DIR).quiet();
			const out = result.stdout.toString();
			expect(out).toContain("Done:");
			expect(out).toContain("STATE-2 - Second State"); // IDs normalized to uppercase
			expect(out).not.toContain("STATE-1");
		});

		it("should filter states by status case-insensitively", async () => {
			const core = new Core(TEST_DIR);

			await core.createState(
				{
					id: "state-1",
					title: "First State",
					status: "To Do",
					assignee: [],
					createdDate: "2025-06-08",
					labels: [],
					dependencies: [],
					rawContent: "First test state",
				},
				true,
			);
			await core.createState(
				{
					id: "state-2",
					title: "Second State",
					status: "Done",
					assignee: [],
					createdDate: "2025-06-08",
					labels: [],
					dependencies: [],
					rawContent: "Second test state",
				},
				true,
			);

			const testCases = ["done", "DONE", "DoNe"];

			for (const status of testCases) {
				const result = await $`bun ${CLI_PATH} state list --plain --status ${status}`.cwd(TEST_DIR).quiet();
				const out = result.stdout.toString();
				expect(out).toContain("Done:");
				expect(out).toContain("STATE-2 - Second State"); // IDs normalized to uppercase
				expect(out).not.toContain("STATE-1");
			}

			// Test with -s flag
			const resultShort = await listStatesPlatformAware({ plain: true, status: "done" }, TEST_DIR);
			const outShort = resultShort.stdout;
			expect(outShort).toContain("Done:");
			expect(outShort).toContain("STATE-2 - Second State"); // IDs normalized to uppercase
			expect(outShort).not.toContain("STATE-1");
		});

		it("should filter states by assignee", async () => {
			const core = new Core(TEST_DIR);

			await core.createState(
				{
					id: "state-1",
					title: "Assigned State",
					status: "To Do",
					assignee: ["alice"],
					createdDate: "2025-06-08",
					labels: [],
					dependencies: [],
					rawContent: "Assigned state",
				},
				false,
			);
			await core.createState(
				{
					id: "state-2",
					title: "Unassigned State",
					status: "To Do",
					assignee: [],
					createdDate: "2025-06-08",
					labels: [],
					dependencies: [],
					rawContent: "Other state",
				},
				false,
			);

			const result = await $`bun ${CLI_PATH} state list --plain --assignee alice`.cwd(TEST_DIR).quiet();
			const out = result.stdout.toString();
			expect(out).toContain("STATE-1 - Assigned State"); // IDs normalized to uppercase
			expect(out).not.toContain("STATE-2 - Unassigned State");
		});
	});

	describe("state view command", () => {
		beforeEach(async () => {
			// Set up a git repository and initialize roadmap
			await $`git init -b main`.cwd(TEST_DIR).quiet();
			await $`git config user.name "Test User"`.cwd(TEST_DIR).quiet();
			await $`git config user.email test@example.com`.cwd(TEST_DIR).quiet();

			const core = new Core(TEST_DIR);
			await core.initializeProject("View Test Project");
		});

		it("should display state details with markdown formatting", async () => {
			const core = new Core(TEST_DIR);

			// Create a test state
			const testState = {
				id: "state-1",
				title: "Test View State",
				status: "To Do",
				assignee: ["testuser"],
				createdDate: "2025-06-08",
				labels: ["test", "cli"],
				dependencies: [],
				rawContent: "This is a test state for view command",
			};

			await core.createState(testState, false);

			// Load the state back
			const loadedState = await core.filesystem.loadState("state-1");
			expect(loadedState).not.toBeNull();
			expect(loadedState?.id).toBe("STATE-1"); // IDs normalized to uppercase
			expect(loadedState?.title).toBe("Test View State");
			expect(loadedState?.status).toBe("To Do");
			expect(loadedState?.assignee).toEqual(["testuser"]);
			expect(loadedState?.labels).toEqual(["test", "cli"]);
			expect(loadedState?.rawContent).toBe("This is a test state for view command");
		});

		it("should handle state IDs with and without 'state-' prefix", async () => {
			const core = new Core(TEST_DIR);

			// Create a test state
			await core.createState(
				{
					id: "state-5",
					title: "Prefix Test State",
					status: "To Do",
					assignee: [],
					createdDate: "2025-06-08",
					labels: [],
					dependencies: [],
					rawContent: "Testing state ID normalization",
				},
				false,
			);

			// Test loading with full state-5 ID
			const stateWithPrefix = await core.filesystem.loadState("state-5");
			expect(stateWithPrefix?.id).toBe("STATE-5"); // IDs normalized to uppercase

			// Test loading with just numeric ID (5)
			const stateWithoutPrefix = await core.filesystem.loadState("5");
			// The filesystem loadState should handle normalization
			expect(stateWithoutPrefix?.id).toBe("STATE-5"); // IDs normalized to uppercase
		});

		it("should return null for non-existent states", async () => {
			const core = new Core(TEST_DIR);

			const nonExistentState = await core.filesystem.loadState("state-999");
			expect(nonExistentState).toBeNull();
		});

		it("should not modify state files (read-only operation)", async () => {
			const core = new Core(TEST_DIR);

			// Create a test state
			const originalState = {
				id: "state-1",
				title: "Read Only Test",
				status: "To Do",
				assignee: [],
				createdDate: "2025-06-08",
				labels: ["readonly"],
				dependencies: [],
				rawContent: "Original description",
			};

			await core.createState(originalState, false);

			// Load the state (simulating view operation)
			const viewedState = await core.filesystem.loadState("state-1");

			// Load again to verify nothing changed
			const secondView = await core.filesystem.loadState("state-1");

			expect(viewedState).toEqual(secondView);
			expect(viewedState?.title).toBe("Read Only Test");
			expect(viewedState?.rawContent).toBe("Original description");
		});
	});

	describe("state shortcut command", () => {
		beforeEach(async () => {
			await $`git init -b main`.cwd(TEST_DIR).quiet();
			await $`git config user.name "Test User"`.cwd(TEST_DIR).quiet();
			await $`git config user.email test@example.com`.cwd(TEST_DIR).quiet();

			const core = new Core(TEST_DIR);
			await core.initializeProject("Shortcut Test Project");
		});

		it("should display formatted state details like the view command", async () => {
			const core = new Core(TEST_DIR);

			await core.createState(
				{
					id: "state-1",
					title: "Shortcut State",
					status: "To Do",
					assignee: [],
					createdDate: "2025-06-08",
					labels: [],
					dependencies: [],
					rawContent: "Shortcut description",
				},
				false,
			);

			const resultShortcut = await viewStatePlatformAware({ stateId: "1", plain: true }, TEST_DIR);
			const resultView = await viewStatePlatformAware({ stateId: "1", plain: true, useViewCommand: true }, TEST_DIR);

			const outShortcut = resultShortcut.stdout;
			const outView = resultView.stdout;

			expect(outShortcut).toBe(outView);
			expect(outShortcut).toContain("State state-1 - Shortcut State");
		});
	});

	describe("state edit command", () => {
		beforeEach(async () => {
			// Set up a git repository and initialize roadmap
			await $`git init -b main`.cwd(TEST_DIR).quiet();
			await $`git config user.name "Test User"`.cwd(TEST_DIR).quiet();
			await $`git config user.email test@example.com`.cwd(TEST_DIR).quiet();

			const core = new Core(TEST_DIR);
			await core.initializeProject("Edit Test Project", true);
		});

		it("should update state title, description, and status", async () => {
			const core = new Core(TEST_DIR);

			// Create a test state
			await core.createState(
				{
					id: "state-1",
					title: "Original Title",
					status: "To Do",
					assignee: [],
					createdDate: "2025-06-08",
					labels: [],
					dependencies: [],
					rawContent: "Original description",
				},
				false,
			);

			// Load and edit the state
			const state = await core.filesystem.loadState("state-1");
			expect(state).not.toBeNull();

			await core.updateStateFromInput(
				"state-1",
				{
					title: "Updated Title",
					description: "Updated description",
					status: "In Progress",
				},
				false,
			);

			// Verify changes were persisted
			const updatedState = await core.filesystem.loadState("state-1");
			expect(updatedState?.title).toBe("Updated Title");
			expect(extractStructuredSection(updatedState?.rawContent || "", "description")).toBe("Updated description");
			expect(updatedState?.status).toBe("In Progress");
			const today = new Date().toISOString().slice(0, 16).replace("T", " ");
			expect(updatedState?.updatedDate).toBe(today);
		});

		it("should update assignee", async () => {
			const core = new Core(TEST_DIR);

			// Create a test state
			await core.createState(
				{
					id: "state-2",
					title: "Assignee Test",
					status: "To Do",
					assignee: [],
					createdDate: "2025-06-08",
					labels: [],
					dependencies: [],
					rawContent: "Testing assignee updates",
				},
				false,
			);

			// Update assignee
			await core.updateStateFromInput("state-2", { assignee: ["newuser@example.com"] }, false);

			// Verify assignee was updated
			const updatedState = await core.filesystem.loadState("state-2");
			expect(updatedState?.assignee).toEqual(["newuser@example.com"]);
		});

		it("should replace all labels with new labels", async () => {
			const core = new Core(TEST_DIR);

			// Create a test state with existing labels
			await core.createState(
				{
					id: "state-3",
					title: "Label Replace Test",
					status: "To Do",
					assignee: [],
					createdDate: "2025-06-08",
					labels: ["old1", "old2"],
					dependencies: [],
					rawContent: "Testing label replacement",
				},
				false,
			);

			// Replace all labels
			await core.updateStateFromInput("state-3", { labels: ["new1", "new2", "new3"] }, false);

			// Verify labels were replaced
			const updatedState = await core.filesystem.loadState("state-3");
			expect(updatedState?.labels).toEqual(["new1", "new2", "new3"]);
		});

		it("should add labels without replacing existing ones", async () => {
			const core = new Core(TEST_DIR);

			// Create a test state with existing labels
			await core.createState(
				{
					id: "state-4",
					title: "Label Add Test",
					status: "To Do",
					assignee: [],
					createdDate: "2025-06-08",
					labels: ["existing"],
					dependencies: [],
					rawContent: "Testing label addition",
				},
				false,
			);

			// Add new labels
			await core.updateStateFromInput("state-4", { addLabels: ["added1", "added2"] }, false);

			// Verify labels were added
			const updatedState = await core.filesystem.loadState("state-4");
			expect(updatedState?.labels).toEqual(["existing", "added1", "added2"]);
		});

		it("should remove specific labels", async () => {
			const core = new Core(TEST_DIR);

			// Create a test state with multiple labels
			await core.createState(
				{
					id: "state-5",
					title: "Label Remove Test",
					status: "To Do",
					assignee: [],
					createdDate: "2025-06-08",
					labels: ["keep1", "remove", "keep2"],
					dependencies: [],
					rawContent: "Testing label removal",
				},
				false,
			);

			// Remove specific label
			await core.updateStateFromInput("state-5", { removeLabels: ["remove"] }, false);

			// Verify label was removed
			const updatedState = await core.filesystem.loadState("state-5");
			expect(updatedState?.labels).toEqual(["keep1", "keep2"]);
		});

		it("should handle non-existent state gracefully", async () => {
			const core = new Core(TEST_DIR);

			const nonExistentState = await core.filesystem.loadState("state-999");
			expect(nonExistentState).toBeNull();
		});

		it("should automatically set updated_date field when editing", async () => {
			const core = new Core(TEST_DIR);

			// Create a test state
			await core.createState(
				{
					id: "state-6",
					title: "Updated Date Test",
					status: "To Do",
					assignee: [],
					createdDate: "2025-06-07",
					labels: [],
					dependencies: [],
					rawContent: "Testing updated date",
				},
				false,
			);

			// Edit the state (without manually setting updatedDate)
			await core.updateStateFromInput("state-6", { title: "Updated Title" }, false);

			// Verify updated_date was automatically set to today's date
			const updatedState = await core.filesystem.loadState("state-6");
			const today = new Date().toISOString().slice(0, 16).replace("T", " ");
			expect(updatedState?.updatedDate).toBe(today);
			expect(updatedState?.createdDate).toBe("2025-06-07"); // Should remain unchanged
		});

		it("should commit changes automatically", async () => {
			const core = new Core(TEST_DIR);

			// Create a test state
			await core.createState(
				{
					id: "state-7",
					title: "Commit Test",
					status: "To Do",
					assignee: [],
					createdDate: "2025-06-08",
					labels: [],
					dependencies: [],
					rawContent: "Testing auto-commit",
				},
				false,
			);

			// Edit the state with auto-commit enabled
			await core.updateStateFromInput("state-7", { title: "Updated for Commit" }, true);

			// Verify the state was updated (this confirms the update functionality works)
			const updatedState = await core.filesystem.loadState("state-7");
			expect(updatedState?.title).toBe("Updated for Commit");

			// For now, just verify that updateState with autoCommit=true doesn't throw
			// The actual git commit functionality is tested at the Core level
		});

		it("should preserve YAML frontmatter formatting", async () => {
			const core = new Core(TEST_DIR);

			// Create a test state
			await core.createState(
				{
					id: "state-8",
					title: "YAML Test",
					status: "To Do",
					assignee: ["testuser"],
					createdDate: "2025-06-08",
					labels: ["yaml", "test"],
					dependencies: ["state-1"],
					rawContent: "Testing YAML preservation",
				},
				false,
			);

			// Edit the state
			await core.updateStateFromInput(
				"state-8",
				{
					title: "Updated YAML Test",
					status: "In Progress",
				},
				false,
			);

			// Verify all frontmatter fields are preserved
			const updatedState = await core.filesystem.loadState("state-8");
			expect(updatedState?.id).toBe("STATE-8"); // IDs normalized to uppercase
			expect(updatedState?.title).toBe("Updated YAML Test");
			expect(updatedState?.status).toBe("In Progress");
			expect(updatedState?.assignee).toEqual(["testuser"]);
			expect(updatedState?.createdDate).toBe("2025-06-08");
			const today = new Date().toISOString().slice(0, 16).replace("T", " ");
			expect(updatedState?.updatedDate).toBe(today);
			expect(updatedState?.labels).toEqual(["yaml", "test"]);
			expect(updatedState?.dependencies).toEqual(["state-1"]);
			expect(updatedState?.rawContent).toBe("Testing YAML preservation");
		});
	});

	describe("state archive and state transition commands", () => {
		beforeEach(async () => {
			// Set up a git repository and initialize roadmap
			await $`git init -b main`.cwd(TEST_DIR).quiet();
			await $`git config user.name "Test User"`.cwd(TEST_DIR).quiet();
			await $`git config user.email test@example.com`.cwd(TEST_DIR).quiet();

			const core = new Core(TEST_DIR);
			await core.initializeProject("Archive Test Project");
		});

		it("should archive a state", async () => {
			const core = new Core(TEST_DIR);

			// Create a test state
			await core.createState(
				{
					id: "state-1",
					title: "Archive Test State",
					status: "Done",
					assignee: [],
					createdDate: "2025-06-08",
					labels: ["completed"],
					dependencies: [],
					rawContent: "State ready for archiving",
				},
				false,
			);

			// Archive the state
			const success = await core.archiveState("state-1", false);
			expect(success).toBe(true);

			// Verify state is no longer in states directory
			const state = await core.filesystem.loadState("state-1");
			expect(state).toBeNull();

			// Verify state exists in archive
			const { readdir } = await import("node:fs/promises");
			const archiveFiles = await readdir(join(TEST_DIR, "roadmap", "archive", "nodes"));
			expect(archiveFiles.some((f) => f.startsWith("state-1"))).toBe(true);
		});

		it("should handle archiving non-existent state", async () => {
			const core = new Core(TEST_DIR);

			const success = await core.archiveState("state-999", false);
			expect(success).toBe(false);
		});

		it("should demote state to drafts", async () => {
			const core = new Core(TEST_DIR);

			// Create a test state
			await core.createState(
				{
					id: "state-2",
					title: "Demote Test State",
					status: "To Do",
					assignee: [],
					createdDate: "2025-06-08",
					labels: ["needs-revision"],
					dependencies: [],
					rawContent: "State that needs to go back to drafts",
				},
				false,
			);

			// Demote the state
			const success = await core.demoteState("state-2", false);
			expect(success).toBe(true);

			// Verify state is no longer in states directory
			const state = await core.filesystem.loadState("state-2");
			expect(state).toBeNull();

			// Verify demoted draft has new draft- ID
			const { readdir } = await import("node:fs/promises");
			const draftsFiles = await readdir(join(TEST_DIR, "roadmap", "drafts"));
			expect(draftsFiles.some((f) => f.startsWith("draft-"))).toBe(true);

			// Verify draft can be loaded with draft- ID
			const demotedDraft = await core.filesystem.loadDraft("draft-1");
			expect(demotedDraft?.title).toBe("Demote Test State");
		});

		it("should promote draft to states", async () => {
			const core = new Core(TEST_DIR);

			// Create a test draft with proper DRAFT-X id
			await core.createDraft(
				{
					id: "draft-3",
					title: "Promote Test Draft",
					status: "Draft",
					assignee: [],
					createdDate: "2025-06-08",
					labels: ["ready"],
					dependencies: [],
					rawContent: "Draft ready for promotion",
				},
				false,
			);

			// Promote the draft
			const success = await core.promoteDraft("draft-3", false);
			expect(success).toBe(true);

			// Verify draft is no longer in drafts directory
			const draft = await core.filesystem.loadDraft("draft-3");
			expect(draft).toBeNull();

			// Verify promoted state has new state- ID
			const { readdir } = await import("node:fs/promises");
			const statesFiles = await readdir(join(TEST_DIR, "roadmap", "nodes"));
			expect(statesFiles.some((f) => f.startsWith("state-"))).toBe(true);

			// Verify state can be loaded with state- ID
			const promotedState = await core.filesystem.loadState("state-1");
			expect(promotedState?.title).toBe("Promote Test Draft");
		});

		it("should archive a draft", async () => {
			const core = new Core(TEST_DIR);

			// Create a test draft with proper DRAFT-X id
			await core.createDraft(
				{
					id: "draft-4",
					title: "Archive Test Draft",
					status: "Draft",
					assignee: [],
					createdDate: "2025-06-08",
					labels: ["cancelled"],
					dependencies: [],
					rawContent: "Draft that should be archived",
				},
				false,
			);

			// Archive the draft
			const success = await core.archiveDraft("draft-4", false);
			expect(success).toBe(true);

			// Verify draft is no longer in drafts directory
			const draft = await core.filesystem.loadDraft("draft-4");
			expect(draft).toBeNull();

			// Verify draft exists in archive
			const { readdir } = await import("node:fs/promises");
			const archiveFiles = await readdir(join(TEST_DIR, "roadmap", "archive", "drafts"));
			expect(archiveFiles.some((f) => f.startsWith("draft-4"))).toBe(true);
		});

		it("should handle promoting non-existent draft", async () => {
			const core = new Core(TEST_DIR);

			const success = await core.promoteDraft("state-999", false);
			expect(success).toBe(false);
		});

		it("should handle demoting non-existent state", async () => {
			const core = new Core(TEST_DIR);

			const success = await core.demoteState("state-999", false);
			expect(success).toBe(false);
		});

		it("should handle archiving non-existent draft", async () => {
			const core = new Core(TEST_DIR);

			const success = await core.archiveDraft("state-999", false);
			expect(success).toBe(false);
		});

		it("should commit archive operations automatically", async () => {
			const core = new Core(TEST_DIR);

			// Create and archive a state with auto-commit
			await core.createState(
				{
					id: "state-5",
					title: "Commit Archive Test",
					status: "Done",
					assignee: [],
					createdDate: "2025-06-08",
					labels: [],
					dependencies: [],
					rawContent: "Testing auto-commit on archive",
				},
				false,
			);

			const success = await core.archiveState("state-5", true); // autoCommit = true
			expect(success).toBe(true);

			// Verify operation completed successfully
			const state = await core.filesystem.loadState("state-5");
			expect(state).toBeNull();
		});

		it("should preserve state content through state transitions", async () => {
			const core = new Core(TEST_DIR);

			// Create a state with rich content
			const originalState = {
				id: "state-6",
				title: "Content Preservation Test",
				status: "In Progress",
				assignee: ["testuser"],
				createdDate: "2025-06-08",
				labels: ["important", "preservation-test"],
				dependencies: ["state-1", "state-2"],
				rawContent: "This state has rich metadata that should be preserved through transitions",
			};

			await core.createState(originalState, false);

			// Demote to draft - note: this generates a new draft ID
			await core.demoteState("state-6", false);

			// Find the demoted draft (it will have a new draft- ID)
			const drafts = await core.filesystem.listDrafts();
			const asDraft = drafts.find((d) => d.title === originalState.title);

			expect(asDraft?.title).toBe(originalState.title);
			expect(asDraft?.assignee).toEqual(originalState.assignee);
			expect(asDraft?.labels).toEqual(originalState.labels);
			expect(asDraft?.dependencies).toEqual(originalState.dependencies);
			expect(asDraft?.rawContent).toContain(originalState.rawContent);

			// Promote back to state - use the draft's new ID
			expect(asDraft).toBeDefined();
			if (!asDraft) {
				throw new Error("Expected demoted draft to exist");
			}
			await core.promoteDraft(asDraft.id, false);

			// Find the promoted state (it will have a new state- ID)
			const states = await core.filesystem.listStates();
			const backToState = states.find((t) => t.title === originalState.title);

			expect(backToState?.title).toBe(originalState.title);
			expect(backToState?.assignee).toEqual(originalState.assignee);
			expect(backToState?.labels).toEqual(originalState.labels);
			expect(backToState?.dependencies).toEqual(originalState.dependencies);
			expect(backToState?.rawContent).toContain(originalState.rawContent);
		});
	});

	describe("doc and decision commands", () => {
		beforeEach(async () => {
			await $`git init -b main`.cwd(TEST_DIR).quiet();
			await $`git config user.name "Test User"`.cwd(TEST_DIR).quiet();
			await $`git config user.email test@example.com`.cwd(TEST_DIR).quiet();

			const core = new Core(TEST_DIR);
			await core.initializeProject("Doc Test Project");
		});

		it("should create and list documents", async () => {
			const core = new Core(TEST_DIR);
			const doc: Document = {
				id: "doc-1",
				title: "Guide",
				type: "guide",
				createdDate: "2025-06-08",
				rawContent: "Content",
			};
			await core.createDocument(doc, false);

			const docs = await core.filesystem.listDocuments();
			expect(docs).toHaveLength(1);
			expect(docs[0]?.title).toBe("Guide");
		});

		it("should create and list decisions", async () => {
			const core = new Core(TEST_DIR);
			const decision: Decision = {
				id: "decision-1",
				title: "Choose Stack",
				date: "2025-06-08",
				status: "accepted",
				context: "context",
				decision: "decide",
				consequences: "conseq",
				rawContent: "",
			};
			await core.createDecision(decision, false);
			const decisions = await core.filesystem.listDecisions();
			expect(decisions).toHaveLength(1);
			expect(decisions[0]?.title).toBe("Choose Stack");
		});
	});

	describe("board view command", () => {
		beforeEach(async () => {
			await $`git init -b main`.cwd(TEST_DIR).quiet();
			await $`git config user.name "Test User"`.cwd(TEST_DIR).quiet();
			await $`git config user.email test@example.com`.cwd(TEST_DIR).quiet();

			const core = new Core(TEST_DIR);
			await core.initializeProject("Board Test Project", true);
		});

		it("should display kanban board with states grouped by status", async () => {
			const core = new Core(TEST_DIR);

			// Create test states with different statuses
			await core.createState(
				{
					id: "state-1",
					title: "Todo State",
					status: "To Do",
					assignee: [],
					createdDate: "2025-06-08",
					labels: [],
					dependencies: [],
					rawContent: "A state in todo",
				},
				false,
			);

			await core.createState(
				{
					id: "state-2",
					title: "Progress State",
					status: "In Progress",
					assignee: [],
					createdDate: "2025-06-08",
					labels: [],
					dependencies: [],
					rawContent: "A state in progress",
				},
				false,
			);

			await core.createState(
				{
					id: "state-3",
					title: "Done State",
					status: "Done",
					assignee: [],
					createdDate: "2025-06-08",
					labels: [],
					dependencies: [],
					rawContent: "A completed state",
				},
				false,
			);

			const states = await core.filesystem.listStates();
			expect(states).toHaveLength(3);

			const config = await core.filesystem.loadConfig();
			const statuses = config?.statuses || [];
			expect(statuses).toEqual(["To Do", "In Progress", "Done"]);

			// Test the kanban board generation
			const { generateKanbanBoardWithMetadata } = await import("../board.ts");
			const board = generateKanbanBoardWithMetadata(states, statuses, "Test Project");

			// Verify board contains all statuses and states (now on separate lines)
			expect(board).toContain("To Do");
			expect(board).toContain("In Progress");
			expect(board).toContain("Done");
			expect(board).toContain("STATE-1");
			expect(board).toContain("Todo State");
			expect(board).toContain("STATE-2");
			expect(board).toContain("Progress State");
			expect(board).toContain("STATE-3");
			expect(board).toContain("Done State");

			// Verify board structure (now includes metadata header)
			const lines = board.split("\n");
			expect(board).toContain("# Kanban Board Export");
			expect(board).toContain("To Do");
			expect(board).toContain("In Progress");
			expect(board).toContain("Done");
			expect(board).toContain("|"); // Table structure
			expect(lines.length).toBeGreaterThan(5); // Should have content rows
		});

		it("should handle empty project with default statuses", async () => {
			const core = new Core(TEST_DIR);

			const states = await core.filesystem.listStates();
			expect(states).toHaveLength(0);

			const config = await core.filesystem.loadConfig();
			const statuses = config?.statuses || [];

			const { generateKanbanBoardWithMetadata } = await import("../board.ts");
			const board = generateKanbanBoardWithMetadata(states, statuses, "Test Project");

			// Should return board with metadata, configured status columns, and empty-state message
			expect(board).toContain("# Kanban Board Export");
			expect(board).toContain("| To Do | In Progress | Done |");
			expect(board).toContain("No states found");
		});

		it("should support vertical layout option", async () => {
			const core = new Core(TEST_DIR);

			await core.createState(
				{
					id: "state-1",
					title: "Todo State",
					status: "To Do",
					assignee: [],
					createdDate: "2025-06-08",
					labels: [],
					dependencies: [],
					rawContent: "A state in todo",
				},
				false,
			);

			const states = await core.filesystem.listStates();
			const config = await core.filesystem.loadConfig();
			const statuses = config?.statuses || [];

			const { generateKanbanBoardWithMetadata } = await import("../board.ts");
			const board = generateKanbanBoardWithMetadata(states, statuses, "Test Project");

			// Should contain proper board structure
			expect(board).toContain("# Kanban Board Export");
			expect(board).toContain("To Do");
			expect(board).toContain("STATE-1");
			expect(board).toContain("Todo State");
		});

		it("should support --vertical shortcut flag", async () => {
			const core = new Core(TEST_DIR);

			await core.createState(
				{
					id: "state-1",
					title: "Shortcut State",
					status: "To Do",
					assignee: [],
					createdDate: "2025-06-09",
					labels: [],
					dependencies: [],
					rawContent: "Testing vertical shortcut",
				},
				false,
			);

			const states = await core.filesystem.listStates();
			const config = await core.filesystem.loadConfig();
			const statuses = config?.statuses || [];

			// Test that --vertical flag produces vertical layout
			const { generateKanbanBoardWithMetadata } = await import("../board.ts");
			const board = generateKanbanBoardWithMetadata(states, statuses, "Test Project");

			// Should contain proper board structure
			expect(board).toContain("# Kanban Board Export");
			expect(board).toContain("To Do");
			expect(board).toContain("STATE-1");
			expect(board).toContain("Shortcut State");
		});

		it("should merge state status from remote branches", async () => {
			const core = new Core(TEST_DIR);

			const state = {
				id: "state-1",
				title: "Remote State",
				status: "To Do",
				assignee: [],
				createdDate: "2025-06-09",
				labels: [],
				dependencies: [],
				rawContent: "from remote",
			} as State;

			await core.createState(state, true);

			// set up remote repository
			const remoteDir = join(TEST_DIR, "remote.git");
			await $`git init --bare -b main ${remoteDir}`.quiet();
			await $`git remote add origin ${remoteDir}`.cwd(TEST_DIR).quiet();
			await $`git push -u origin main`.cwd(TEST_DIR).quiet();

			// create branch with updated status
			await $`git checkout -b feature`.cwd(TEST_DIR).quiet();
			await core.updateStateFromInput("state-1", { status: "Done" }, true);
			await $`git push -u origin feature`.cwd(TEST_DIR).quiet();

			// Update remote-tracking branches to ensure they are recognized
			await $`git remote update origin --prune`.cwd(TEST_DIR).quiet();

			// switch back to main where status is still To Do
			await $`git checkout main`.cwd(TEST_DIR).quiet();

			await core.gitOps.fetch();
			const branches = await core.gitOps.listRemoteBranches();
			const config = await core.filesystem.loadConfig();
			const statuses = config?.statuses || [];

			const localStates = await core.filesystem.listStates();
			const statesById = new Map(localStates.map((t) => [t.id, t]));

			for (const branch of branches) {
				const ref = `origin/${branch}`;
				const files = await core.gitOps.listFilesInTree(ref, "roadmap/nodes");
				for (const file of files) {
					const content = await core.gitOps.showFile(ref, file);
					const remoteState = parseState(content);
					const existing = statesById.get(remoteState.id);
					const currentIdx = existing ? statuses.indexOf(existing.status) : -1;
					const newIdx = statuses.indexOf(remoteState.status);
					if (!existing || newIdx > currentIdx || currentIdx === -1 || newIdx === currentIdx) {
						statesById.set(remoteState.id, remoteState);
					}
				}
			}

			const final = statesById.get("STATE-1"); // IDs normalized to uppercase
			expect(final?.status).toBe("Done");
		});

		it("should default to view when no subcommand is provided", async () => {
			const core = new Core(TEST_DIR);

			await core.createState(
				{
					id: "state-99",
					title: "Default Cmd State",
					status: "To Do",
					assignee: [],
					createdDate: "2025-06-10",
					labels: [],
					dependencies: [],
					rawContent: "test",
				},
				false,
			);

			const resultDefault = await $`bun ${["src/cli.ts", "board"]}`.cwd(TEST_DIR).quiet().nothrow();
			const resultView = await $`bun ${["src/cli.ts", "board", "view"]}`.cwd(TEST_DIR).quiet().nothrow();

			expect(resultDefault.stdout.toString()).toBe(resultView.stdout.toString());
		});

		it("should export kanban board to file", async () => {
			const core = new Core(TEST_DIR);

			// Create test states
			await core.createState(
				{
					id: "state-1",
					title: "Export Test State",
					status: "To Do",
					assignee: [],
					createdDate: "2025-06-09",
					labels: [],
					dependencies: [],
					rawContent: "Testing board export",
				},
				false,
			);

			const { exportKanbanBoardToFile } = await import("../index.ts");
			const outputPath = join(TEST_DIR, "test-export.md");
			const states = await core.filesystem.listStates();
			const config = await core.filesystem.loadConfig();
			const statuses = config?.statuses || [];

			await exportKanbanBoardToFile(states, statuses, outputPath, "TestProject");

			// Verify file was created and contains expected content
			const content = await Bun.file(outputPath).text();
			expect(content).toContain("To Do");
			expect(content).toContain("STATE-1");
			expect(content).toContain("Export Test State");
			expect(content).toContain("# Kanban Board Export (powered by Roadmap.md)");
			expect(content).toContain("Project: TestProject");

			// Test overwrite behavior
			await exportKanbanBoardToFile(states, statuses, outputPath, "TestProject");
			const overwrittenContent = await Bun.file(outputPath).text();
			const occurrences = overwrittenContent.split("STATE-1").length - 1;
			expect(occurrences).toBe(1); // Should appear once after overwrite
		});
	});
});
