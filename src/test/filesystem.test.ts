import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdir, readdir, rename, stat } from "node:fs/promises";
import { join } from "node:path";
import { FileSystem } from "../file-system/operations.ts";
import { serializeState } from "../markdown/serializer.ts";
import type { RoadmapConfig, Decision, Document, State } from "../types/index.ts";
import { createUniqueTestDir, safeCleanup } from "./test-utils.ts";

let TEST_DIR: string;

describe("FileSystem", () => {
	let filesystem: FileSystem;

	beforeEach(async () => {
		TEST_DIR = createUniqueTestDir("test-roadmap");
		filesystem = new FileSystem(TEST_DIR);
		await filesystem.ensureRoadmapStructure();
	});

	afterEach(async () => {
		try {
			await safeCleanup(TEST_DIR);
		} catch {
			// Ignore cleanup errors - the unique directory names prevent conflicts
		}
	});

	describe("ensureRoadmapStructure", () => {
		it("should create all required directories", async () => {
			const expectedDirs = [
				join(TEST_DIR, "roadmap"),
				join(TEST_DIR, "roadmap", "nodes"),
				join(TEST_DIR, "roadmap", "drafts"),
				join(TEST_DIR, "roadmap", "archive", "nodes"),
				join(TEST_DIR, "roadmap", "archive", "drafts"),
				join(TEST_DIR, "roadmap", "docs"),
				join(TEST_DIR, "roadmap", "decisions"),
			];

			for (const dir of expectedDirs) {
				const stats = await stat(dir);
				expect(stats.isDirectory()).toBe(true);
			}
		});
	});

	describe("state operations", () => {
		const sampleState: State = {
			id: "state-1",
			title: "Test State",
			status: "To Do",
			assignee: ["@developer"],
			reporter: "@manager",
			createdDate: "2025-06-03",
			labels: ["test"],
			milestone: "v1.0",
			dependencies: [],
			description: "This is a test state",
		};

		it("should save and load a state", async () => {
			await filesystem.saveState(sampleState);

			const loadedState = await filesystem.loadState("state-1");
			expect(loadedState?.id).toBe("STATE-1"); // IDs are normalized to uppercase
			expect(loadedState?.title).toBe(sampleState.title);
			expect(loadedState?.status).toBe(sampleState.status);
			expect(loadedState?.description).toBe(sampleState.description);
		});

		it("should return null for non-existent state", async () => {
			const state = await filesystem.loadState("non-existent");
			expect(state).toBeNull();
		});

		it("should list all states", async () => {
			await filesystem.saveState(sampleState);
			await filesystem.saveState({
				...sampleState,
				id: "state-2",
				title: "Second State",
			});

			const states = await filesystem.listStates();
			expect(states).toHaveLength(2);
			expect(states.map((t) => t.id)).toEqual(["STATE-1", "STATE-2"]); // IDs are normalized to uppercase
		});

		it("should list states even when one file has invalid frontmatter", async () => {
			await filesystem.saveState(sampleState);
			await filesystem.saveState({
				...sampleState,
				id: "state-2",
				title: "Second State",
			});

			const invalidPath = join(filesystem.statesDir, "state-99 - invalid.md");
			await Bun.write(
				invalidPath,
				`---
id: state-99
assignee: [@broken
status: To Do
title: Broken State
---

Invalid content`,
			);

			const states = await filesystem.listStates();
			expect(states.map((t) => t.id)).toEqual(["STATE-1", "STATE-2"]); // IDs normalized to uppercase
		});

		it("should sort states numerically by ID", async () => {
			// Create states with IDs that would sort incorrectly with string comparison
			const stateIds = ["state-2", "state-10", "state-1", "state-20", "state-3"];
			for (const id of stateIds) {
				await filesystem.saveState({
					...sampleState,
					id,
					title: `State ${id}`,
				});
			}

			const states = await filesystem.listStates();
			expect(states.map((t) => t.id)).toEqual(["STATE-1", "STATE-2", "STATE-3", "STATE-10", "STATE-20"]); // IDs normalized to uppercase
		});

		it("should sort states with decimal IDs correctly", async () => {
			// Create states with decimal IDs
			const stateIds = ["state-2.10", "state-2.2", "state-2", "state-1", "state-2.1"];
			for (const id of stateIds) {
				await filesystem.saveState({
					...sampleState,
					id,
					title: `State ${id}`,
				});
			}

			const states = await filesystem.listStates();
			expect(states.map((t) => t.id)).toEqual(["STATE-1", "STATE-2", "STATE-2.1", "STATE-2.2", "STATE-2.10"]); // IDs normalized to uppercase
		});

		it("should filter states by status and assignee", async () => {
			await filesystem.saveState({
				...sampleState,
				id: "state-1",
				status: "To Do",
				assignee: ["alice"],
				title: "State 1",
			});
			await filesystem.saveState({
				...sampleState,
				id: "state-2",
				status: "Done",
				assignee: ["bob"],
				title: "State 2",
			});
			await filesystem.saveState({
				...sampleState,
				id: "state-3",
				status: "To Do",
				assignee: ["bob"],
				title: "State 3",
			});

			const statusFiltered = await filesystem.listStates({ status: "to do" });
			expect(statusFiltered.map((t) => t.id)).toEqual(["STATE-1", "STATE-3"]); // IDs normalized to uppercase

			const assigneeFiltered = await filesystem.listStates({ assignee: "bob" });
			expect(assigneeFiltered.map((t) => t.id)).toEqual(["STATE-2", "STATE-3"]); // IDs normalized to uppercase

			const combinedFiltered = await filesystem.listStates({ status: "to do", assignee: "bob" });
			expect(combinedFiltered.map((t) => t.id)).toEqual(["STATE-3"]); // IDs normalized to uppercase
		});

		it("should archive a state", async () => {
			await filesystem.saveState(sampleState);

			const archived = await filesystem.archiveState("state-1");
			expect(archived).toBe(true);

			const state = await filesystem.loadState("state-1");
			expect(state).toBeNull();

			// Check that file exists in archive
			const archiveFiles = await readdir(join(TEST_DIR, "roadmap", "archive", "nodes"));
			expect(archiveFiles.some((f) => f.startsWith("state-1"))).toBe(true);
		});

		it("should demote a state to drafts with new draft- ID", async () => {
			await filesystem.saveState(sampleState);

			const demoted = await filesystem.demoteState("state-1");
			expect(demoted).toBe(true);

			// State should be removed from states directory
			const statesFiles = await readdir(join(TEST_DIR, "roadmap", "nodes"));
			expect(statesFiles.some((f) => f.startsWith("state-1"))).toBe(false);

			// Draft should exist with new draft- ID
			const draftsFiles = await readdir(join(TEST_DIR, "roadmap", "drafts"));
			expect(draftsFiles.some((f) => f.startsWith("draft-1"))).toBe(true);

			// Verify the demoted draft can be loaded and has correct ID
			const demotedDraft = await filesystem.loadDraft("draft-1");
			expect(demotedDraft?.id).toBe("DRAFT-1");
			expect(demotedDraft?.title).toBe(sampleState.title);
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
			description: "Draft description",
		};

		it("should save and load a draft", async () => {
			await filesystem.saveDraft(sampleDraft);

			const loaded = await filesystem.loadDraft("draft-1");
			expect(loaded?.id).toBe("DRAFT-1"); // IDs are normalized to uppercase
			expect(loaded?.title).toBe(sampleDraft.title);
		});

		it("should list all drafts", async () => {
			await filesystem.saveDraft(sampleDraft);
			await filesystem.saveDraft({ ...sampleDraft, id: "draft-2", title: "Second" });

			const drafts = await filesystem.listDrafts();
			expect(drafts.map((d) => d.id).sort()).toEqual(["DRAFT-1", "DRAFT-2"]);
		});

		it("should promote a draft to states with new state- ID", async () => {
			await filesystem.saveDraft(sampleDraft);

			const promoted = await filesystem.promoteDraft("draft-1");
			expect(promoted).toBe(true);

			// Draft should be removed from drafts directory
			const draftsFiles = await readdir(join(TEST_DIR, "roadmap", "drafts"));
			expect(draftsFiles.some((f) => f.startsWith("draft-1"))).toBe(false);

			// State should exist with new state- ID
			const statesFiles = await readdir(join(TEST_DIR, "roadmap", "nodes"));
			expect(statesFiles.some((f) => f.startsWith("state-1"))).toBe(true);

			// Verify the promoted state can be loaded and has correct ID
			const promotedState = await filesystem.loadState("state-1");
			expect(promotedState?.id).toBe("STATE-1");
			expect(promotedState?.title).toBe(sampleDraft.title);
		});

		it("should promote draft with custom state prefix", async () => {
			// Configure custom state prefix
			const customConfig: RoadmapConfig = {
				projectName: "Custom Prefix Project",
				statuses: ["To Do", "In Progress", "Done"],
				labels: [],
				milestones: [],
				dateFormat: "yyyy-MM-dd",
				prefixes: {
					state: "JIRA",
				},
			};
			await filesystem.saveConfig(customConfig);
			await filesystem.saveDraft(sampleDraft);

			const promoted = await filesystem.promoteDraft("draft-1");
			expect(promoted).toBe(true);

			// Draft should be removed
			const draftsFiles = await readdir(join(TEST_DIR, "roadmap", "drafts"));
			expect(draftsFiles.some((f) => f.startsWith("draft-1"))).toBe(false);

			// State should exist with custom JIRA- prefix
			const statesFiles = await readdir(join(TEST_DIR, "roadmap", "nodes"));
			expect(statesFiles.some((f) => f.startsWith("jira-1"))).toBe(true);

			// Verify the promoted state can be loaded with the custom prefix
			const promotedState = await filesystem.loadState("jira-1");
			expect(promotedState?.id).toBe("JIRA-1");
			expect(promotedState?.title).toBe(sampleDraft.title);
		});

		it("should not reuse completed state IDs when promoting draft", async () => {
			// Create a completed state directly in the completed directory
			// This simulates a state that was created and completed before the draft
			const completedDir = join(TEST_DIR, "roadmap", "completed");
			await mkdir(completedDir, { recursive: true });

			const completedState: State = {
				id: "STATE-1",
				title: "Completed State",
				status: "Done",
				assignee: [],
				createdDate: "2025-01-01",
				labels: [],
				dependencies: [],
			};
			const content = serializeState(completedState);
			await Bun.write(join(completedDir, "state-1 - Completed State.md"), content);

			// Verify no active states exist
			const activeStates = await filesystem.listStates();
			expect(activeStates.length).toBe(0);

			// Verify completed state exists
			const completedStates = await filesystem.listCompletedStates();
			expect(completedStates.length).toBe(1);
			expect(completedStates[0]?.id).toBe("STATE-1");

			// Create and promote a draft
			await filesystem.saveDraft(sampleDraft);
			const promoted = await filesystem.promoteDraft("draft-1");
			expect(promoted).toBe(true);

			// BUG: Currently returns STATE-1 because promoteDraft only checks active states
			// Expected: Should return STATE-2 to avoid collision with completed state
			const promotedState = await filesystem.loadState("state-2");
			expect(promotedState?.id).toBe("STATE-2");
			expect(promotedState?.title).toBe(sampleDraft.title);
		});

		it("should archive a draft", async () => {
			await filesystem.saveDraft(sampleDraft);

			const archived = await filesystem.archiveDraft("draft-1");
			expect(archived).toBe(true);

			const draft = await filesystem.loadDraft("draft-1");
			expect(draft).toBeNull();

			const files = await readdir(join(TEST_DIR, "roadmap", "archive", "drafts"));
			expect(files.some((f) => f.startsWith("draft-1"))).toBe(true);
		});
	});

	describe("config operations", () => {
		const sampleConfig: RoadmapConfig = {
			projectName: "Test Project",
			defaultAssignee: "@admin",
			defaultStatus: "To Do",
			defaultReporter: undefined,
			statuses: ["To Do", "In Progress", "Done"],
			labels: ["bug", "feature"],
			dateFormat: "yyyy-mm-dd",
		};

		it("should save and load config", async () => {
			await filesystem.saveConfig(sampleConfig);

			const loadedConfig = await filesystem.loadConfig();
			expect(loadedConfig).toEqual(sampleConfig);
		});

		it("should return null for missing config", async () => {
			// Create a fresh filesystem without any config
			const freshFilesystem = new FileSystem(join(TEST_DIR, "fresh"));
			await freshFilesystem.ensureRoadmapStructure();

			const config = await freshFilesystem.loadConfig();
			expect(config).toBeNull();
		});

		it("should handle defaultReporter field", async () => {
			const cfg: RoadmapConfig = {
				projectName: "Reporter",
				defaultReporter: "@author",
				statuses: ["To Do"],
				labels: [],
				dateFormat: "yyyy-mm-dd",
			};

			await filesystem.saveConfig(cfg);
			const loaded = await filesystem.loadConfig();
			expect(loaded?.defaultReporter).toBe("@author");
		});
	});

	describe("user config operations", () => {
		it("should save and load local and global user settings", async () => {
			await filesystem.setUserSetting("reporter", "local", false);
			await filesystem.setUserSetting("reporter", "global", true);

			const local = await filesystem.getUserSetting("reporter", false);
			const global = await filesystem.getUserSetting("reporter", true);

			expect(local).toBe("local");
			expect(global).toBe("global");
		});
	});

	describe("directory accessors", () => {
		it("should provide correct directory paths", () => {
			expect(filesystem.statesDir).toBe(join(TEST_DIR, "roadmap", "nodes"));
			expect(filesystem.archiveStatesDir).toBe(join(TEST_DIR, "roadmap", "archive", "nodes"));
			expect(filesystem.decisionsDir).toBe(join(TEST_DIR, "roadmap", "decisions"));
			expect(filesystem.docsDir).toBe(join(TEST_DIR, "roadmap", "docs"));
		});
	});

	describe("decision log operations", () => {
		const sampleDecision: Decision = {
			id: "decision-1",
			title: "Use TypeScript",
			date: "2025-06-07",
			status: "accepted",
			context: "Need type safety",
			decision: "Use TypeScript",
			consequences: "Better DX",
			rawContent: "",
		};

		it("should save and load a decision log", async () => {
			await filesystem.saveDecision(sampleDecision);

			const loadedDecision = await filesystem.loadDecision("decision-1");
			expect(loadedDecision?.id).toBe(sampleDecision.id);
			expect(loadedDecision?.title).toBe(sampleDecision.title);
			expect(loadedDecision?.status).toBe(sampleDecision.status);
			expect(loadedDecision?.context).toBe(sampleDecision.context);
		});

		it("should return null for non-existent decision log", async () => {
			const decision = await filesystem.loadDecision("non-existent");
			expect(decision).toBeNull();
		});

		it("should sanitize decision filenames", async () => {
			await filesystem.saveDecision({
				...sampleDecision,
				id: "decision-3",
				title: "Use OAuth (v2)!",
			});

			const decisionFiles = await readdir(filesystem.decisionsDir);
			expect(decisionFiles).toContain("decision-3 - Use-OAuth-v2.md");
		});

		it("should save decision log with alternatives", async () => {
			const decisionWithAlternatives: Decision = {
				...sampleDecision,
				id: "decision-2",
				alternatives: "Considered JavaScript",
			};

			await filesystem.saveDecision(decisionWithAlternatives);
			const loaded = await filesystem.loadDecision("decision-2");

			expect(loaded?.alternatives).toBe("Considered JavaScript");
		});

		it("should remove legacy decision filenames when resaving", async () => {
			const legacyDecision: Decision = {
				...sampleDecision,
				id: "decision-legacy",
				title: "Legacy Decision (OAuth)!",
				decision: "First draft",
			};

			await filesystem.saveDecision(legacyDecision);

			const files = await readdir(filesystem.decisionsDir);
			const sanitized = files.find((f) => f.startsWith("decision-legacy -"));
			expect(sanitized).toBe("decision-legacy - Legacy-Decision-OAuth.md");

			const legacyFilename = "decision-legacy - Legacy-Decision-(OAuth)!.md";
			await rename(join(filesystem.decisionsDir, sanitized as string), join(filesystem.decisionsDir, legacyFilename));

			await filesystem.saveDecision({ ...legacyDecision, decision: "Updated decision" });

			const finalFiles = await readdir(filesystem.decisionsDir);
			expect(finalFiles).toEqual(["decision-legacy - Legacy-Decision-OAuth.md"]);

			const loaded = await filesystem.loadDecision("decision-legacy");
			expect(loaded?.decision).toBe("Updated decision");
		});

		it("should list decision logs", async () => {
			await filesystem.saveDecision(sampleDecision);
			const list = await filesystem.listDecisions();
			expect(list).toHaveLength(1);
			expect(list[0]?.id).toBe(sampleDecision.id);
		});
	});

	describe("document operations", () => {
		const sampleDocument: Document = {
			id: "doc-1",
			title: "API Guide",
			type: "guide",
			createdDate: "2025-06-07",
			updatedDate: "2025-06-08",
			rawContent: "This is the API guide content.",
			tags: ["api", "guide"],
		};

		it("should save a document", async () => {
			await filesystem.saveDocument(sampleDocument);

			// Check that file was created
			const docsFiles = await readdir(filesystem.docsDir);
			expect(docsFiles.some((f) => f.includes("API-Guide"))).toBe(true);
		});

		it("should save document without optional fields", async () => {
			const minimalDoc: Document = {
				id: "doc-2",
				title: "Simple Doc",
				type: "readme",
				createdDate: "2025-06-07",
				rawContent: "Simple content.",
			};

			await filesystem.saveDocument(minimalDoc);

			const docsFiles = await readdir(filesystem.docsDir);
			expect(docsFiles.some((f) => f.includes("Simple-Doc"))).toBe(true);
		});

		it("should sanitize document filenames", async () => {
			await filesystem.saveDocument({
				...sampleDocument,
				id: "doc-9",
				title: "Docs (Guide)! #1",
			});

			const docsFiles = await readdir(filesystem.docsDir);
			expect(docsFiles).toContain("doc-9 - Docs-Guide-1.md");
		});

		it("removes the previous document file when the title changes", async () => {
			await filesystem.saveDocument(sampleDocument);

			await filesystem.saveDocument({
				...sampleDocument,
				title: "API Guide Updated",
				rawContent: "Updated content",
			});

			const docFiles = await Array.fromAsync(
				new Bun.Glob("doc-*.md").scan({ cwd: filesystem.docsDir, followSymlinks: true }),
			);
			expect(docFiles).toHaveLength(1);
			expect(docFiles[0]).toBe("doc-1 - API-Guide-Updated.md");
		});

		it("should list documents", async () => {
			await filesystem.saveDocument(sampleDocument);
			const list = await filesystem.listDocuments();
			expect(list.some((d) => d.id === sampleDocument.id)).toBe(true);
		});

		it("should include relative path metadata when listing documents", async () => {
			await filesystem.saveDocument(
				{
					...sampleDocument,
					id: "doc-3",
					title: "Nested Guide",
				},
				"guides",
			);

			const docs = await filesystem.listDocuments();
			const nested = docs.find((doc) => doc.id === "doc-3");
			expect(nested?.path).toBe(join("guides", "doc-3 - Nested-Guide.md"));
		});

		it("should load documents using flexible ID formats", async () => {
			await filesystem.saveDocument({
				...sampleDocument,
				id: "doc-7",
				title: "Operations Reference",
				rawContent: "Ops content",
			});

			const uppercase = await filesystem.loadDocument("DOC-7");
			expect(uppercase.id).toBe("doc-7");

			const zeroPadded = await filesystem.loadDocument("0007");
			expect(zeroPadded.id).toBe("doc-7");

			await filesystem.saveDocument({
				...sampleDocument,
				id: "DOC-0009",
				title: "Padded Uppercase",
				rawContent: "Content",
			});

			const canonicalFiles = await Array.fromAsync(
				new Bun.Glob("doc-*.md").scan({ cwd: filesystem.docsDir, followSymlinks: true }),
			);
			expect(canonicalFiles.some((file) => file.startsWith("doc-0009"))).toBe(true);
		});
	});

	describe("edge cases", () => {
		it("should handle state with state- prefix in id", async () => {
			const stateWithPrefix: State = {
				id: "state-prefixed",
				title: "Already Prefixed",
				status: "To Do",
				assignee: [],
				createdDate: "2025-06-07",
				labels: [],
				dependencies: [],
				description: "State with state- prefix",
			};

			await filesystem.saveState(stateWithPrefix);
			const loaded = await filesystem.loadState("state-prefixed");

			expect(loaded?.id).toBe("STATE-PREFIXED"); // IDs are normalized to uppercase
		});

		it("should handle state without state- prefix in id", async () => {
			// ID without any prefix pattern (no letters-dash)
			const stateWithoutPrefix: State = {
				id: "123",
				title: "No Prefix",
				status: "To Do",
				assignee: [],
				createdDate: "2025-06-07",
				labels: [],
				dependencies: [],
				description: "State without prefix",
			};

			await filesystem.saveState(stateWithoutPrefix);
			const loaded = await filesystem.loadState("state-123");

			// IDs without prefix get the configured (or default) state prefix
			expect(loaded?.id).toBe("STATE-123");
		});

		it("should preserve custom prefix in id", async () => {
			// ID with a custom prefix pattern (letters-something)
			const stateWithCustomPrefix: State = {
				id: "JIRA-456",
				title: "Custom Prefix",
				status: "To Do",
				assignee: [],
				createdDate: "2025-06-07",
				labels: [],
				dependencies: [],
				description: "State with custom prefix",
			};

			await filesystem.saveState(stateWithCustomPrefix);
			const loaded = await filesystem.loadState("jira-456");

			// IDs with existing prefix are preserved (normalized to uppercase)
			expect(loaded?.id).toBe("JIRA-456");
		});

		it("should return empty array when listing states in empty directory", async () => {
			const states = await filesystem.listStates();
			expect(states).toEqual([]);
		});

		it("should return false when archiving non-existent state", async () => {
			const result = await filesystem.archiveState("non-existent");
			expect(result).toBe(false);
		});

		it("should handle config with all optional fields", async () => {
			const fullConfig: RoadmapConfig = {
				projectName: "Full Project",
				defaultAssignee: "@admin",
				defaultStatus: "To Do",
				defaultReporter: undefined,
				statuses: ["To Do", "In Progress", "Done"],
				labels: ["bug", "feature", "enhancement"],
				dateFormat: "yyyy-mm-dd",
			};

			await filesystem.saveConfig(fullConfig);
			const loaded = await filesystem.loadConfig();

			expect(loaded).toEqual(fullConfig);
		});

		it("should handle config with minimal fields", async () => {
			const minimalConfig: RoadmapConfig = {
				projectName: "Minimal Project",
				statuses: ["To Do", "Done"],
				labels: [],
				dateFormat: "yyyy-mm-dd",
			};

			await filesystem.saveConfig(minimalConfig);
			const loaded = await filesystem.loadConfig();

			expect(loaded?.projectName).toBe("Minimal Project");
			expect(loaded?.defaultAssignee).toBeUndefined();
			expect(loaded?.defaultStatus).toBeUndefined();
		});

		it("should sanitize filenames correctly", async () => {
			const stateWithSpecialChars: State = {
				id: "state-special",
				title: "State/with\\special:chars?",
				status: "To Do",
				assignee: [],
				createdDate: "2025-06-07",
				labels: [],
				dependencies: [],
				description: "State with special characters in title",
			};

			await filesystem.saveState(stateWithSpecialChars);
			const loaded = await filesystem.loadState("state-special");

			expect(loaded?.title).toBe("State/with\\special:chars?");
		});

		it("should preserve case in filenames", async () => {
			const stateWithMixedCase: State = {
				id: "state-mixed",
				title: "Fix State List Ordering",
				status: "To Do",
				assignee: [],
				createdDate: "2025-06-07",
				labels: [],
				dependencies: [],
				description: "State with mixed case title",
			};

			await filesystem.saveState(stateWithMixedCase);

			// Check that the file exists with preserved case
			const files = await readdir(filesystem.statesDir);
			const stateFile = files.find((f) => f.startsWith("state-mixed -"));
			expect(stateFile).toBe("state-mixed - Fix-State-List-Ordering.md");

			// Verify the state can be loaded
			const loaded = await filesystem.loadState("state-mixed");
			expect(loaded?.title).toBe("Fix State List Ordering");
		});

		it("should strip punctuation from filenames", async () => {
			const stateWithPunctuation: State = {
				id: "state-punct",
				title: "Fix the user's login (OAuth)! #1",
				status: "To Do",
				assignee: [],
				createdDate: "2025-06-07",
				labels: [],
				dependencies: [],
				description: "State with punctuation in the title",
			};

			await filesystem.saveState(stateWithPunctuation);

			const files = await readdir(filesystem.statesDir);
			const filename = files.find((f) => f.startsWith("state-punct -"));
			expect(filename).toBe("state-punct - Fix-the-users-login-OAuth-1.md");
		});

		it("should load states with legacy filenames containing punctuation", async () => {
			const legacyState: State = {
				id: "state-legacy",
				title: "Legacy user's login (OAuth)",
				status: "To Do",
				assignee: [],
				createdDate: "2025-06-07",
				labels: [],
				dependencies: [],
				description: "Legacy punctuation state",
			};

			await filesystem.saveState(legacyState);

			const files = await readdir(filesystem.statesDir);
			const originalFilename = files.find((f) => f.startsWith("state-legacy -"));
			expect(originalFilename).toBeDefined();

			const legacyFilename = "state-legacy - Legacy-user's-login-(OAuth).md";
			await rename(join(filesystem.statesDir, originalFilename as string), join(filesystem.statesDir, legacyFilename));

			const loaded = await filesystem.loadState("state-legacy");
			expect(loaded?.title).toBe("Legacy user's login (OAuth)");
		});

		it("should sanitize a variety of problematic state titles", async () => {
			const cases: Array<{ id: string; title: string; expected: string }> = [
				{
					id: "state-bad-1",
					title: "Fix the user's login (OAuth)! #1",
					expected: "Fix-the-users-login-OAuth-1",
				},
				{
					id: "state-bad-2",
					title: "Crazy!@#$%^&*()Name",
					expected: "Crazy-Name",
				},
				{
					id: "state-bad-3",
					title: "File with <bad> |chars| and /slashes\\",
					expected: "File-with-bad-chars-and-slashes",
				},
				{
					id: "state-bad-4",
					title: "Tabs\tand\nnewlines",
					expected: "Tabs-and-newlines",
				},
				{
					id: "state-bad-5",
					title: "Edge -- dashes ???",
					expected: "Edge-dashes",
				},
			];

			for (const { id, title, expected } of cases) {
				await filesystem.saveState({
					id,
					title,
					status: "To Do",
					assignee: [],
					createdDate: "2025-06-07",
					labels: [],
					dependencies: [],
					description: "Sanitization test",
				});

				const files = await readdir(filesystem.statesDir);
				expect(files).toContain(`${id} - ${expected}.md`);
			}
		});

		it("should avoid double dashes in filenames", async () => {
			const weirdState: State = {
				id: "state-dashes",
				title: "State -- with  -- multiple   dashes",
				status: "To Do",
				assignee: [],
				createdDate: "2025-06-07",
				labels: [],
				dependencies: [],
				description: "Check double dashes",
			};

			await filesystem.saveState(weirdState);
			const files = await readdir(filesystem.statesDir);
			const filename = files.find((f) => f.startsWith("state-dashes -"));
			expect(filename).toBeDefined();
			expect(filename?.includes("--")).toBe(false);
		});
	});
});
