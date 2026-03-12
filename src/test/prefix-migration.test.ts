import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { migrateDraftPrefixes, needsDraftPrefixMigration } from "../core/prefix-migration.ts";
import { FileSystem } from "../file-system/operations.ts";
import { serializeState } from "../markdown/serializer.ts";
import type { RoadmapConfig, State } from "../types/index.ts";
import { createUniqueTestDir, safeCleanup } from "./test-utils.ts";

let TEST_DIR: string;

describe("Draft Prefix Migration", () => {
	let filesystem: FileSystem;

	beforeEach(async () => {
		TEST_DIR = createUniqueTestDir("test-prefix-migration");
		filesystem = new FileSystem(TEST_DIR);
		await filesystem.ensureRoadmapStructure();
	});

	afterEach(async () => {
		try {
			await safeCleanup(TEST_DIR);
		} catch {
			// Ignore cleanup errors
		}
	});

	describe("needsDraftPrefixMigration", () => {
		it("should return false when config is null", () => {
			expect(needsDraftPrefixMigration(null)).toBe(false);
		});

		it("should return true when prefixes section is missing", () => {
			const config: RoadmapConfig = {
				projectName: "Test",
				statuses: ["To Do", "Done"],
				labels: [],
				milestones: [],
				dateFormat: "YYYY-MM-DD",
			};
			expect(needsDraftPrefixMigration(config)).toBe(true);
		});

		it("should return false when prefixes section exists", () => {
			const config: RoadmapConfig = {
				projectName: "Test",
				statuses: ["To Do", "Done"],
				labels: [],
				milestones: [],
				dateFormat: "YYYY-MM-DD",
				prefixes: {
					state: "state",
				},
			};
			expect(needsDraftPrefixMigration(config)).toBe(false);
		});
	});

	describe("migrateDraftPrefixes", () => {
		it("should add prefixes section to config when drafts folder is empty", async () => {
			// Create initial config without prefixes
			const initialConfig: RoadmapConfig = {
				projectName: "Test Project",
				statuses: ["To Do", "In Progress", "Done"],
				labels: [],
				milestones: [],
				dateFormat: "YYYY-MM-DD",
			};
			await filesystem.saveConfig(initialConfig);

			// Run migration
			await migrateDraftPrefixes(filesystem);

			// Verify config has prefixes section
			const config = await filesystem.loadConfig();
			expect(config?.prefixes).toBeDefined();
			expect(config?.prefixes?.state).toBe("state");
		});

		it("should rename state-*.md files in drafts folder to draft-*.md", async () => {
			// Create initial config without prefixes
			const initialConfig: RoadmapConfig = {
				projectName: "Test Project",
				statuses: ["To Do", "In Progress", "Done"],
				labels: [],
				milestones: [],
				dateFormat: "YYYY-MM-DD",
			};
			await filesystem.saveConfig(initialConfig);

			// Create state-*.md file in drafts folder (old format)
			const draftsDir = await filesystem.getDraftsDir();
			const oldState: State = {
				id: "state-1",
				title: "Old Draft",
				status: "Draft",
				assignee: [],
				createdDate: "2025-01-01",
				labels: [],
				dependencies: [],
				description: "This is an old draft with state- prefix",
			};
			const content = serializeState(oldState);
			await Bun.write(join(draftsDir, "state-1 - Old Draft.md"), content);

			// Run migration
			await migrateDraftPrefixes(filesystem);

			// Verify old file is gone
			const files = await readdir(draftsDir);
			expect(files.some((f) => f.startsWith("state-1"))).toBe(false);

			// Verify new draft file exists
			expect(files.some((f) => f.startsWith("draft-1"))).toBe(true);

			// Verify draft can be loaded with draft- ID
			const migratedDraft = await filesystem.loadDraft("draft-1");
			expect(migratedDraft?.title).toBe("Old Draft");
			expect(migratedDraft?.id).toBe("DRAFT-1"); // IDs normalized to uppercase
		});

		it("should update IDs inside migrated files", async () => {
			// Create initial config without prefixes
			const initialConfig: RoadmapConfig = {
				projectName: "Test Project",
				statuses: ["To Do", "In Progress", "Done"],
				labels: [],
				milestones: [],
				dateFormat: "YYYY-MM-DD",
			};
			await filesystem.saveConfig(initialConfig);

			// Create state-*.md file in drafts folder
			const draftsDir = await filesystem.getDraftsDir();
			const oldState: State = {
				id: "state-5",
				title: "Draft with State ID",
				status: "Draft",
				assignee: ["@developer"],
				createdDate: "2025-01-01",
				labels: ["feature"],
				dependencies: [],
				description: "Test draft",
			};
			const content = serializeState(oldState);
			await Bun.write(join(draftsDir, "state-5 - Draft with State ID.md"), content);

			// Run migration
			await migrateDraftPrefixes(filesystem);

			// Verify ID was updated
			const migratedDraft = await filesystem.loadDraft("draft-1");
			expect(migratedDraft?.id).toBe("DRAFT-1"); // IDs normalized to uppercase
			expect(migratedDraft?.assignee).toEqual(["@developer"]);
			expect(migratedDraft?.labels).toEqual(["feature"]);
		});

		it("should handle multiple state-*.md files", async () => {
			// Create initial config without prefixes
			const initialConfig: RoadmapConfig = {
				projectName: "Test Project",
				statuses: ["To Do", "In Progress", "Done"],
				labels: [],
				milestones: [],
				dateFormat: "YYYY-MM-DD",
			};
			await filesystem.saveConfig(initialConfig);

			// Create multiple state-*.md files
			const draftsDir = await filesystem.getDraftsDir();
			const states = [
				{ id: "state-1", title: "First Draft" },
				{ id: "state-2", title: "Second Draft" },
				{ id: "state-3", title: "Third Draft" },
			];

			for (const t of states) {
				const state: State = {
					...t,
					status: "Draft",
					assignee: [],
					createdDate: "2025-01-01",
					labels: [],
					dependencies: [],
				};
				const content = serializeState(state);
				await Bun.write(join(draftsDir, `${t.id} - ${t.title}.md`), content);
			}

			// Run migration
			await migrateDraftPrefixes(filesystem);

			// Verify all files were migrated
			const files = await readdir(draftsDir);
			expect(files.filter((f) => f.startsWith("state-")).length).toBe(0);
			expect(files.filter((f) => f.startsWith("draft-")).length).toBe(3);

			// Verify drafts can be loaded
			const drafts = await filesystem.listDrafts();
			expect(drafts.length).toBe(3);
		});

		it("should be idempotent - running twice has same result", async () => {
			// Create initial config without prefixes
			const initialConfig: RoadmapConfig = {
				projectName: "Test Project",
				statuses: ["To Do", "In Progress", "Done"],
				labels: [],
				milestones: [],
				dateFormat: "YYYY-MM-DD",
			};
			await filesystem.saveConfig(initialConfig);

			// Create state-*.md file
			const draftsDir = await filesystem.getDraftsDir();
			const oldState: State = {
				id: "state-1",
				title: "Draft",
				status: "Draft",
				assignee: [],
				createdDate: "2025-01-01",
				labels: [],
				dependencies: [],
			};
			const content = serializeState(oldState);
			await Bun.write(join(draftsDir, "state-1 - Draft.md"), content);

			// Run migration first time
			await migrateDraftPrefixes(filesystem);

			// Get state after first migration
			const filesAfterFirst = await readdir(draftsDir);
			const configAfterFirst = await filesystem.loadConfig();

			// Run migration second time
			await migrateDraftPrefixes(filesystem);

			// Verify state is the same
			const filesAfterSecond = await readdir(draftsDir);
			const configAfterSecond = await filesystem.loadConfig();

			expect(filesAfterSecond).toEqual(filesAfterFirst);
			expect(configAfterSecond?.prefixes).toEqual(configAfterFirst?.prefixes);
		});

		it("should not affect existing draft-*.md files", async () => {
			// Create initial config without prefixes
			const initialConfig: RoadmapConfig = {
				projectName: "Test Project",
				statuses: ["To Do", "In Progress", "Done"],
				labels: [],
				milestones: [],
				dateFormat: "YYYY-MM-DD",
			};
			await filesystem.saveConfig(initialConfig);

			// Create an existing draft-*.md file (correct format)
			const existingDraft: State = {
				id: "draft-1",
				title: "Existing Draft",
				status: "Draft",
				assignee: [],
				createdDate: "2025-01-01",
				labels: [],
				dependencies: [],
			};
			await filesystem.saveDraft(existingDraft);

			// Create a state-*.md file (old format)
			const draftsDir = await filesystem.getDraftsDir();
			const oldState: State = {
				id: "state-5",
				title: "Old Format Draft",
				status: "Draft",
				assignee: [],
				createdDate: "2025-01-01",
				labels: [],
				dependencies: [],
			};
			const content = serializeState(oldState);
			await Bun.write(join(draftsDir, "state-5 - Old Format Draft.md"), content);

			// Run migration
			await migrateDraftPrefixes(filesystem);

			// Verify existing draft is unchanged
			const existingLoaded = await filesystem.loadDraft("draft-1");
			expect(existingLoaded?.title).toBe("Existing Draft");

			// Verify new draft was created with next available ID
			const drafts = await filesystem.listDrafts();
			expect(drafts.length).toBe(2);
			expect(drafts.map((d) => d.id).sort()).toEqual(["DRAFT-1", "DRAFT-2"]);
		});
	});
});
