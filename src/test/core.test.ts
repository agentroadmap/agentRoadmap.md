import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { join } from "node:path";
import { $ } from "bun";
import { Core } from "../core/roadmap.ts";
import type { Document, State } from "../types/index.ts";
import { createUniqueTestDir, safeCleanup } from "./test-utils.ts";

let TEST_DIR: string;

describe("Core", () => {
	let core: Core;

	beforeEach(async () => {
		TEST_DIR = createUniqueTestDir("test-core");
		core = new Core(TEST_DIR);
		await core.filesystem.ensureRoadmapStructure();

		// Initialize git repository for testing
		await $`git init -b main`.cwd(TEST_DIR).quiet();
		await $`git config user.name "Test User"`.cwd(TEST_DIR).quiet();
		await $`git config user.email test@example.com`.cwd(TEST_DIR).quiet();
	});

	afterEach(async () => {
		try {
			await safeCleanup(TEST_DIR);
		} catch {
			// Ignore cleanup errors - the unique directory names prevent conflicts
		}
	});

	describe("initialization", () => {
		it("should have filesystem and git operations available", () => {
			expect(core.filesystem).toBeDefined();
			expect(core.gitOps).toBeDefined();
		});

		it("should initialize project with default config", async () => {
			await core.initializeProject("Test Project", true);

			const config = await core.filesystem.loadConfig();
			expect(config?.projectName).toBe("Test Project");
			expect(config?.statuses).toEqual(["To Do", "In Progress", "Done"]);
			expect(config?.defaultStatus).toBe("To Do");
		});
	});

	describe("state operations", () => {
		const sampleState: State = {
			id: "state-1",
			title: "Test State",
			status: "To Do",
			assignee: [],
			createdDate: "2025-06-07",
			labels: ["test"],
			dependencies: [],
			description: "This is a test state",
		};

		beforeEach(async () => {
			await core.initializeProject("Test Project", true);
		});

		it("should create state without auto-commit", async () => {
			await core.createState(sampleState, false);

			const loadedState = await core.filesystem.loadState("state-1");
			expect(loadedState?.id).toBe("STATE-1");
			expect(loadedState?.title).toBe("Test State");
		});

		it("should create state with auto-commit", async () => {
			await core.createState(sampleState, true);

			// Check if state file was created
			const loadedState = await core.filesystem.loadState("state-1");
			expect(loadedState?.id).toBe("STATE-1");

			// Check git status to see if there are uncommitted changes
			const _hasChanges = await core.gitOps.hasUncommittedChanges();

			const lastCommit = await core.gitOps.getLastCommitMessage();
			// For now, just check that we have a commit (could be initialization or state)
			expect(lastCommit).toBeDefined();
			expect(lastCommit.length).toBeGreaterThan(0);
		});

		it("should update state with auto-commit", async () => {
			await core.createState(sampleState, true);

			// Check original state
			const originalState = await core.filesystem.loadState("state-1");
			expect(originalState?.title).toBe("Test State");

			await core.updateStateFromInput("state-1", { title: "Updated State" }, true);

			// Check if state was updated
			const loadedState = await core.filesystem.loadState("state-1");
			expect(loadedState?.title).toBe("Updated State");

			const lastCommit = await core.gitOps.getLastCommitMessage();
			// For now, just check that we have a commit (could be initialization or state)
			expect(lastCommit).toBeDefined();
			expect(lastCommit.length).toBeGreaterThan(0);
		});

		it("should archive state with auto-commit", async () => {
			await core.createState(sampleState, true);

			const archived = await core.archiveState("state-1", true);
			expect(archived).toBe(true);

			const lastCommit = await core.gitOps.getLastCommitMessage();
			expect(lastCommit).toContain("roadmap: Archive state STATE-1");
		});

		it("should demote state with auto-commit", async () => {
			await core.createState(sampleState, true);

			const demoted = await core.demoteState("state-1", true);
			expect(demoted).toBe(true);

			const lastCommit = await core.gitOps.getLastCommitMessage();
			expect(lastCommit).toContain("roadmap: Demote state STATE-1");
		});

		it("should resolve states using flexible ID formats", async () => {
			const standardState: State = { ...sampleState, id: "state-5", title: "Standard" };
			const paddedState: State = { ...sampleState, id: "state-007", title: "Padded" };
			await core.createState(standardState, false);
			await core.createState(paddedState, false);

			const uppercase = await core.getState("STATE-5");
			expect(uppercase?.id).toBe("STATE-5");

			const bare = await core.getState("5");
			expect(bare?.id).toBe("STATE-5");

			const zeroPadded = await core.getState("0007");
			expect(zeroPadded?.id).toBe("STATE-007");

			const mixedCase = await core.getState("State-007");
			expect(mixedCase?.id).toBe("STATE-007");
		});

		it("should resolve numeric-only IDs with custom prefix (BACK-364)", async () => {
			// Configure custom prefix
			const config = await core.filesystem.loadConfig();
			if (!config) {
				throw new Error("Expected config to be loaded");
			}
			await core.filesystem.saveConfig({
				...config,
				prefixes: { state: "back" },
			});

			// Create states with custom prefix
			const state1: State = { ...sampleState, id: "back-358", title: "Custom Prefix State" };
			const state2: State = { ...sampleState, id: "back-5.1", title: "Custom Prefix Substate" };
			await core.createState(state1, false);
			await core.createState(state2, false);

			// Numeric-only lookup should find state with custom prefix
			const byNumeric = await core.getState("358");
			expect(byNumeric?.id).toBe("BACK-358");
			expect(byNumeric?.title).toBe("Custom Prefix State");

			// Dotted numeric lookup should find substate
			const byDotted = await core.getState("5.1");
			expect(byDotted?.id).toBe("BACK-5.1");
			expect(byDotted?.title).toBe("Custom Prefix Substate");

			// Full prefixed ID should also work (case-insensitive)
			const byFullId = await core.getState("BACK-358");
			expect(byFullId?.id).toBe("BACK-358");

			const byLowercase = await core.getState("back-358");
			expect(byLowercase?.id).toBe("BACK-358");
		});

		it("should NOT match numeric ID with typos when using custom prefix (BACK-364)", async () => {
			// Configure custom prefix
			const config = await core.filesystem.loadConfig();
			if (!config) {
				throw new Error("Expected config to be loaded");
			}
			await core.filesystem.saveConfig({
				...config,
				prefixes: { state: "back" },
			});

			// Create state with custom prefix
			const state: State = { ...sampleState, id: "back-358", title: "Custom Prefix State" };
			await core.createState(state, false);

			// Typos should NOT match (prevent parseInt coercion bug)
			const withTypo = await core.getState("358a");
			expect(withTypo).toBeNull();

			const withTypo2 = await core.getState("35x8");
			expect(withTypo2).toBeNull();
		});

		it("should return false when archiving non-existent state", async () => {
			const archived = await core.archiveState("non-existent", true);
			expect(archived).toBe(false);
		});

		it("should apply default status when state has empty status", async () => {
			const stateWithoutStatus: State = {
				...sampleState,
				status: "",
			};

			await core.createState(stateWithoutStatus, false);

			const loadedState = await core.filesystem.loadState("state-1");
			expect(loadedState?.status).toBe("To Do"); // Should use default from config
		});

		it("should not override existing status", async () => {
			const stateWithStatus: State = {
				...sampleState,
				status: "In Progress",
			};

			await core.createState(stateWithStatus, false);

			const loadedState = await core.filesystem.loadState("state-1");
			expect(loadedState?.status).toBe("In Progress");
		});

		it("should preserve description text when saving without header markers", async () => {
			const stateNoHeader: State = {
				...sampleState,
				id: "state-2",
				description: "Just text",
			};

			await core.createState(stateNoHeader, false);
			const loaded = await core.filesystem.loadState("state-2");
			expect(loaded?.description).toBe("Just text");
			const body = await core.getStateContent("state-2");
			const matches = (body?.match(/## Description/g) ?? []).length;
			expect(matches).toBe(1);
		});

		it("should not duplicate description header in saved content", async () => {
			const stateWithHeader: State = {
				...sampleState,
				id: "state-3",
				description: "Existing",
			};

			await core.createState(stateWithHeader, false);
			const body = await core.getStateContent("state-3");
			const matches = (body?.match(/## Description/g) ?? []).length;
			expect(matches).toBe(1);
		});

		it("should handle state creation without auto-commit when git fails", async () => {
			// Create state in directory without git
			const nonGitCore = new Core(join(TEST_DIR, "no-git"));
			await nonGitCore.filesystem.ensureRoadmapStructure();

			// This should succeed even without git
			await nonGitCore.createState(sampleState, false);

			const loadedState = await nonGitCore.filesystem.loadState("state-1");
			expect(loadedState?.id).toBe("STATE-1");
		});

		it("should normalize assignee for string and array inputs", async () => {
			const stringState = {
				...sampleState,
				id: "state-2",
				title: "String Assignee",
				assignee: "@alice",
			} as unknown as State;
			await core.createState(stringState, false);
			const loadedString = await core.filesystem.loadState("state-2");
			expect(loadedString?.assignee).toEqual(["@alice"]);

			const arrayState: State = {
				...sampleState,
				id: "state-3",
				title: "Array Assignee",
				assignee: ["@bob"],
			};
			await core.createState(arrayState, false);
			const loadedArray = await core.filesystem.loadState("state-3");
			expect(loadedArray?.assignee).toEqual(["@bob"]);
		});

		it("should normalize assignee when updating states", async () => {
			await core.createState(sampleState, false);

			await core.updateStateFromInput("state-1", { assignee: ["@carol"] }, false);
			let loaded = await core.filesystem.loadState("state-1");
			expect(loaded?.assignee).toEqual(["@carol"]);

			await core.updateStateFromInput("state-1", { assignee: ["@dave"] }, false);
			loaded = await core.filesystem.loadState("state-1");
			expect(loaded?.assignee).toEqual(["@dave"]);
		});

		it("should create sub-states with proper hierarchical IDs", async () => {
			await core.initializeProject("Substate Project", true);

			// Create parent state
			const { state: parent } = await core.createStateFromInput({
				title: "Parent State",
				status: "To Do",
			});
			expect(parent.id).toBe("STATE-1");

			// Create first sub-state
			const { state: child1 } = await core.createStateFromInput({
				title: "First Child",
				parentStateId: parent.id,
				status: "To Do",
			});
			expect(child1.id).toBe("STATE-1.1");
			expect(child1.parentStateId).toBe("STATE-1");

			// Create second sub-state
			const { state: child2 } = await core.createStateFromInput({
				title: "Second Child",
				parentStateId: parent.id,
				status: "To Do",
			});
			expect(child2.id).toBe("STATE-1.2");
			expect(child2.parentStateId).toBe("STATE-1");

			// Create another parent state to ensure sequential numbering still works
			const { state: parent2 } = await core.createStateFromInput({
				title: "Second Parent",
				status: "To Do",
			});
			expect(parent2.id).toBe("STATE-2");
		});
	});

	describe("document operations", () => {
		const baseDocument: Document = {
			id: "doc-1",
			title: "Operations Guide",
			type: "guide",
			createdDate: "2025-06-07",
			rawContent: "# Ops Guide",
		};

		beforeEach(async () => {
			await core.initializeProject("Test Project", false);
		});

		it("updates a document title without leaving the previous file behind", async () => {
			await core.createDocument(baseDocument, false);

			const [initialFile] = await Array.fromAsync(
				new Bun.Glob("doc-*.md").scan({ cwd: core.filesystem.docsDir, followSymlinks: true }),
			);
			expect(initialFile).toBe("doc-1 - Operations-Guide.md");

			const documents = await core.filesystem.listDocuments();
			const existingDoc = documents[0];
			if (!existingDoc) {
				throw new Error("Expected document to exist after creation");
			}
			expect(existingDoc.title).toBe("Operations Guide");

			await core.updateDocument({ ...existingDoc, title: "Operations Guide Updated" }, "# Updated content", false);

			const docFiles = await Array.fromAsync(
				new Bun.Glob("doc-*.md").scan({ cwd: core.filesystem.docsDir, followSymlinks: true }),
			);
			expect(docFiles).toHaveLength(1);
			expect(docFiles[0]).toBe("doc-1 - Operations-Guide-Updated.md");

			const updatedDocs = await core.filesystem.listDocuments();
			expect(updatedDocs[0]?.title).toBe("Operations Guide Updated");
		});

		it("shows a git rename when the document title changes", async () => {
			await core.createDocument(baseDocument, true);

			const renamedDoc: Document = {
				...baseDocument,
				title: "Operations Guide Renamed",
			};

			await core.updateDocument(renamedDoc, "# Ops Guide", false);

			await $`git add -A`.cwd(TEST_DIR).quiet();
			const diffResult = await $`git diff --name-status -M HEAD`.cwd(TEST_DIR).quiet();
			const diff = diffResult.stdout.toString();
			const previousPath = "roadmap/docs/doc-1 - Operations-Guide.md";
			const renamedPath = "roadmap/docs/doc-1 - Operations-Guide-Renamed.md";
			const escapeForRegex = (value: string) => value.replace(/[|\\{}()[\]^$+*?.]/g, "\\$&");
			expect(diff).toMatch(
				new RegExp(`^R\\d*\\t${escapeForRegex(previousPath)}\\t${escapeForRegex(renamedPath)}`, "m"),
			);
		});
	});

	describe("draft operations", () => {
		// Drafts now use DRAFT-X id format and draft-x filename prefix
		const sampleDraft: State = {
			id: "draft-1",
			title: "Draft State",
			status: "Draft",
			assignee: [],
			createdDate: "2025-06-07",
			labels: [],
			dependencies: [],
			description: "Draft state",
		};

		beforeEach(async () => {
			await core.initializeProject("Draft Project", true);
		});

		it("should create draft without auto-commit", async () => {
			await core.createDraft(sampleDraft, false);

			const loaded = await core.filesystem.loadDraft("draft-1");
			expect(loaded?.id).toBe("DRAFT-1");
		});

		it("should create draft with auto-commit", async () => {
			await core.createDraft(sampleDraft, true);

			const loaded = await core.filesystem.loadDraft("draft-1");
			expect(loaded?.id).toBe("DRAFT-1");

			const lastCommit = await core.gitOps.getLastCommitMessage();
			expect(lastCommit).toBeDefined();
			expect(lastCommit.length).toBeGreaterThan(0);
		});

		it("should promote draft with auto-commit", async () => {
			await core.createDraft(sampleDraft, true);

			const promoted = await core.promoteDraft("draft-1", true);
			expect(promoted).toBe(true);

			const lastCommit = await core.gitOps.getLastCommitMessage();
			expect(lastCommit).toContain("roadmap: Promote draft DRAFT-1");
		});

		it("should archive draft with auto-commit", async () => {
			await core.createDraft(sampleDraft, true);

			const archived = await core.archiveDraft("draft-1", true);
			expect(archived).toBe(true);

			const lastCommit = await core.gitOps.getLastCommitMessage();
			expect(lastCommit).toContain("roadmap: Archive draft DRAFT-1");
		});

		it("should normalize assignee for string and array inputs", async () => {
			const draftString = {
				...sampleDraft,
				id: "draft-2",
				title: "Draft String",
				assignee: "@erin",
			} as unknown as State;
			await core.createDraft(draftString, false);
			const loadedString = await core.filesystem.loadDraft("draft-2");
			expect(loadedString?.assignee).toEqual(["@erin"]);

			const draftArray: State = {
				...sampleDraft,
				id: "draft-3",
				title: "Draft Array",
				assignee: ["@frank"],
			};
			await core.createDraft(draftArray, false);
			const loadedArray = await core.filesystem.loadDraft("draft-3");
			expect(loadedArray?.assignee).toEqual(["@frank"]);
		});
	});

	describe("integration with config", () => {
		it("should use custom default status from config", async () => {
			// Initialize with custom config
			await core.initializeProject("Custom Project");

			// Update config with custom default status
			const config = await core.filesystem.loadConfig();
			if (config) {
				config.defaultStatus = "Custom Status";
				await core.filesystem.saveConfig(config);
			}

			const stateWithoutStatus: State = {
				id: "state-custom",
				title: "Custom State",
				status: "",
				assignee: [],
				createdDate: "2025-06-07",
				labels: [],
				dependencies: [],
				description: "State without status",
			};

			await core.createState(stateWithoutStatus, false);

			const loadedState = await core.filesystem.loadState("state-custom");
			expect(loadedState?.status).toBe("Custom Status");
		});

		it("should fall back to To Do when config has no default status", async () => {
			// Initialize project
			await core.initializeProject("Fallback Project");

			// Update config to remove default status
			const config = await core.filesystem.loadConfig();
			if (config) {
				config.defaultStatus = undefined;
				await core.filesystem.saveConfig(config);
			}

			const stateWithoutStatus: State = {
				id: "state-fallback",
				title: "Fallback State",
				status: "",
				assignee: [],
				createdDate: "2025-06-07",
				labels: [],
				dependencies: [],
				description: "State without status",
			};

			await core.createState(stateWithoutStatus, false);

			const loadedState = await core.filesystem.loadState("state-fallback");
			expect(loadedState?.status).toBe("To Do");
		});
	});

	describe("directory accessor integration", () => {
		it("should use FileSystem directory accessors for git operations", async () => {
			await core.initializeProject("Accessor Test");

			const state: State = {
				id: "state-accessor",
				title: "Accessor Test State",
				status: "To Do",
				assignee: [],
				createdDate: "2025-06-07",
				labels: [],
				dependencies: [],
				description: "Testing directory accessors",
			};

			// Create state without auto-commit to avoid potential git timing issues
			await core.createState(state, false);

			// Verify the state file was created in the correct directory
			const _statesDir = core.filesystem.statesDir;

			// List all files to see what was actually created
			const allFiles = await core.filesystem.listStates();

			// Check that a state with the expected ID exists
			const createdState = allFiles.find((t) => t.id === "STATE-ACCESSOR");
			expect(createdState).toBeDefined();
			expect(createdState?.title).toBe("Accessor Test State");
		}, 10000);
	});
});
