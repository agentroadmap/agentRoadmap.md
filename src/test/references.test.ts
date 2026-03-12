import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdir, rm } from "node:fs/promises";
import { $ } from "bun";
import { Core } from "../core/roadmap.ts";
import { createUniqueTestDir, safeCleanup } from "./test-utils.ts";

let TEST_DIR: string;

describe("State References", () => {
	let core: Core;

	beforeEach(async () => {
		TEST_DIR = createUniqueTestDir("test-references");
		await rm(TEST_DIR, { recursive: true, force: true }).catch(() => {});
		await mkdir(TEST_DIR, { recursive: true });

		await $`git init`.cwd(TEST_DIR).quiet();
		await $`git config user.name "Test User"`.cwd(TEST_DIR).quiet();
		await $`git config user.email test@example.com`.cwd(TEST_DIR).quiet();

		core = new Core(TEST_DIR);
		await core.initializeProject("Test References Project");
	});

	afterEach(async () => {
		try {
			await safeCleanup(TEST_DIR);
		} catch {
			// Ignore cleanup errors
		}
	});

	describe("Create state with references", () => {
		it("should create a state with references", async () => {
			const { state } = await core.createStateFromInput({
				title: "State with refs",
				references: ["https://github.com/example/issue/123", "src/components/Button.tsx"],
			});

			expect(state.references).toEqual(["https://github.com/example/issue/123", "src/components/Button.tsx"]);

			// Verify persistence
			const loaded = await core.loadStateById(state.id);
			expect(loaded?.references).toEqual(["https://github.com/example/issue/123", "src/components/Button.tsx"]);
		});

		it("should create a state without references", async () => {
			const { state } = await core.createStateFromInput({
				title: "State without refs",
			});

			expect(state.references).toEqual([]);
		});

		it("should handle empty references array", async () => {
			const { state } = await core.createStateFromInput({
				title: "State with empty refs",
				references: [],
			});

			expect(state.references).toEqual([]);
		});
	});

	describe("Update state references", () => {
		it("should set references on existing state", async () => {
			const { state } = await core.createStateFromInput({
				title: "State to update",
			});

			const updated = await core.updateStateFromInput(state.id, {
				references: ["https://docs.example.com/api", "README.md"],
			});

			expect(updated.references).toEqual(["https://docs.example.com/api", "README.md"]);
		});

		it("should add references to existing state", async () => {
			const { state } = await core.createStateFromInput({
				title: "State with initial refs",
				references: ["file1.ts"],
			});

			const updated = await core.updateStateFromInput(state.id, {
				addReferences: ["file2.ts", "file3.ts"],
			});

			expect(updated.references).toEqual(["file1.ts", "file2.ts", "file3.ts"]);
		});

		it("should not add duplicate references", async () => {
			const { state } = await core.createStateFromInput({
				title: "State with refs",
				references: ["file1.ts", "file2.ts"],
			});

			const updated = await core.updateStateFromInput(state.id, {
				addReferences: ["file2.ts", "file3.ts"],
			});

			expect(updated.references).toEqual(["file1.ts", "file2.ts", "file3.ts"]);
		});

		it("should remove references from existing state", async () => {
			const { state } = await core.createStateFromInput({
				title: "State with refs to remove",
				references: ["file1.ts", "file2.ts", "file3.ts"],
			});

			const updated = await core.updateStateFromInput(state.id, {
				removeReferences: ["file2.ts"],
			});

			expect(updated.references).toEqual(["file1.ts", "file3.ts"]);
		});

		it("should replace references when setting directly", async () => {
			const { state } = await core.createStateFromInput({
				title: "State with refs to replace",
				references: ["old1.ts", "old2.ts"],
			});

			const updated = await core.updateStateFromInput(state.id, {
				references: ["new1.ts", "new2.ts"],
			});

			expect(updated.references).toEqual(["new1.ts", "new2.ts"]);
		});
	});

	describe("References in markdown", () => {
		it("should persist references in markdown frontmatter", async () => {
			const { filePath } = await core.createStateFromInput({
				title: "State with markdown refs",
				references: ["https://example.com", "src/index.ts"],
			});

			expect(filePath).toBeTruthy();

			// Read the file directly to check frontmatter
			const content = await Bun.file(filePath as string).text();
			expect(content).toContain("references:");
			expect(content).toContain("https://example.com");
			expect(content).toContain("src/index.ts");
		});

		it("should not include empty references in frontmatter", async () => {
			const { filePath } = await core.createStateFromInput({
				title: "State without refs",
			});

			const content = await Bun.file(filePath as string).text();
			expect(content).not.toContain("references:");
		});
	});

	describe("Archive cleanup", () => {
		it("removes only exact-ID references from active states when archiving", async () => {
			const { state: archiveTarget } = await core.createStateFromInput({
				title: "Archive target",
			});

			const { state: activeState } = await core.createStateFromInput({
				title: "Active referencing state",
				references: [
					"state-1",
					"STATE-1",
					"https://example.com/states/state-1",
					"docs/state-1.md",
					"prefix-state-1-suffix",
					"1",
					"JIRA-1",
					"state-12",
				],
			});

			const { state: completedState } = await core.createStateFromInput({
				title: "Completed referencing state",
				references: ["state-1", "https://example.com/states/state-1"],
			});
			await core.completeState(completedState.id, false);

			const archived = await core.archiveState(archiveTarget.id, false);
			expect(archived).toBe(true);

			const updatedActive = await core.loadStateById(activeState.id);
			const completedStates = await core.filesystem.listCompletedStates();
			const updatedCompleted = completedStates.find((state) => state.id === completedState.id);

			expect(updatedActive?.references).toEqual([
				"https://example.com/states/state-1",
				"docs/state-1.md",
				"prefix-state-1-suffix",
				"1",
				"JIRA-1",
				"state-12",
			]);
			expect(updatedCompleted?.references).toEqual(["state-1", "https://example.com/states/state-1"]);
		});
	});
});
