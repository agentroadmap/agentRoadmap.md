import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { join } from "node:path";
import { $ } from "bun";
import { McpServer } from "../mcp/server.ts";
import { registerMilestoneTools } from "../mcp/tools/milestones/index.ts";
import { registerStateTools } from "../mcp/tools/states/index.ts";
import { createUniqueTestDir, safeCleanup } from "./test-utils.ts";

const getText = (content: unknown[] | undefined, index = 0): string => {
	const item = content?.[index] as { text?: string } | undefined;
	return item?.text ?? "";
};

let TEST_DIR: string;
let server: McpServer;

async function loadConfigOrThrow(mcpServer: McpServer) {
	const config = await mcpServer.filesystem.loadConfig();
	if (!config) {
		throw new Error("Failed to load config");
	}
	return config;
}

async function writeLegacyMilestoneFile(
	mcpServer: McpServer,
	id: string,
	title: string,
	description = `Milestone: ${title}`,
): Promise<void> {
	const slug = title
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
	const filename = `${id} - ${slug || "milestone"}.md`;
	const escapedTitle = title.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
	const content = `---
id: ${id}
title: "${escapedTitle}"
---

## Description

${description}
`;
	await Bun.write(join(mcpServer.filesystem.milestonesDir, filename), content);
}

describe("MCP milestone tools", () => {
	beforeEach(async () => {
		TEST_DIR = createUniqueTestDir("mcp-milestones");
		server = new McpServer(TEST_DIR, "Test instructions");
		await server.filesystem.ensureRoadmapStructure();

		await $`git init -b main`.cwd(TEST_DIR).quiet();
		await $`git config user.name "Test User"`.cwd(TEST_DIR).quiet();
		await $`git config user.email test@example.com`.cwd(TEST_DIR).quiet();

		await server.initializeProject("Test Project");

		const config = await loadConfigOrThrow(server);
		registerStateTools(server, config);
		registerMilestoneTools(server);
	});

	afterEach(async () => {
		try {
			await server.stop();
		} catch {
			// ignore
		}
		await safeCleanup(TEST_DIR);
	});

	it("supports setting and clearing milestone via state_create/state_edit", async () => {
		await server.testInterface.callTool({
			params: { name: "milestone_add", arguments: { name: "Release 1.0" } },
		});
		await server.testInterface.callTool({
			params: { name: "milestone_add", arguments: { name: "Release 2.0" } },
		});

		await server.testInterface.callTool({
			params: {
				name: "state_create",
				arguments: {
					title: "Milestone state",
					milestone: "Release 1.0",
				},
			},
		});

		const created = await server.getState("state-1");
		expect(created?.milestone).toBe("m-0");

		await server.testInterface.callTool({
			params: {
				name: "state_edit",
				arguments: {
					id: "state-1",
					milestone: "Release 2.0",
				},
			},
		});

		const updated = await server.getState("state-1");
		expect(updated?.milestone).toBe("m-1");

		await server.testInterface.callTool({
			params: {
				name: "state_edit",
				arguments: {
					id: "state-1",
					milestone: "m-0",
				},
			},
		});

		const updatedById = await server.getState("state-1");
		expect(updatedById?.milestone).toBe("m-0");

		await server.testInterface.callTool({
			params: {
				name: "state_edit",
				arguments: {
					id: "state-1",
					milestone: null,
				},
			},
		});

		const cleared = await server.getState("state-1");
		expect(cleared?.milestone).toBeUndefined();

		await server.testInterface.callTool({
			params: {
				name: "state_create",
				arguments: {
					title: "Milestone state by id",
					milestone: "m-1",
				},
			},
		});
		const createdById = await server.getState("state-2");
		expect(createdById?.milestone).toBe("m-1");

		await server.testInterface.callTool({
			params: {
				name: "state_create",
				arguments: {
					title: "Unconfigured milestone state",
					milestone: "Planned Later",
				},
			},
		});
		const createdWithUnconfiguredMilestone = await server.getState("state-3");
		expect(createdWithUnconfiguredMilestone?.milestone).toBe("Planned Later");
	});

	it("supports numeric milestone aliases for ID-based operations", async () => {
		await server.testInterface.callTool({
			params: { name: "milestone_add", arguments: { name: "Release 1.0" } },
		});
		await server.testInterface.callTool({
			params: { name: "milestone_add", arguments: { name: "Release 2.0" } },
		});

		await server.testInterface.callTool({
			params: {
				name: "state_create",
				arguments: {
					title: "Numeric alias create",
					milestone: "1",
				},
			},
		});
		const created = await server.getState("state-1");
		expect(created?.milestone).toBe("m-1");

		await server.testInterface.callTool({
			params: {
				name: "state_edit",
				arguments: {
					id: "state-1",
					milestone: "0",
				},
			},
		});
		const edited = await server.getState("state-1");
		expect(edited?.milestone).toBe("m-0");

		const rename = await server.testInterface.callTool({
			params: { name: "milestone_rename", arguments: { from: "1", to: "Release 2.1" } },
		});
		expect(getText(rename.content)).toContain('Renamed milestone "Release 2.0" (m-1)');
		expect(getText(rename.content)).toContain('"Release 2.1"');

		const remove = await server.testInterface.callTool({
			params: { name: "milestone_remove", arguments: { name: "1" } },
		});
		expect(getText(remove.content)).toContain("(m-1)");
	});

	it("resolves zero-padded legacy milestone IDs for numeric aliases", async () => {
		await writeLegacyMilestoneFile(server, "m-01", "Legacy Release");

		await server.testInterface.callTool({
			params: {
				name: "state_create",
				arguments: {
					title: "Legacy alias state",
					milestone: "1",
				},
			},
		});
		const created = await server.getState("state-1");
		expect(created?.milestone).toBe("m-01");

		await server.testInterface.callTool({
			params: {
				name: "state_edit",
				arguments: {
					id: "state-1",
					milestone: "m-1",
				},
			},
		});
		const updated = await server.getState("state-1");
		expect(updated?.milestone).toBe("m-01");

		const renamed = await server.testInterface.callTool({
			params: { name: "milestone_rename", arguments: { from: "1", to: "Legacy Release Prime" } },
		});
		expect(getText(renamed.content)).toContain("(m-01)");
		expect(getText(renamed.content)).toContain('"Legacy Release Prime"');
		expect(getText(renamed.content)).toContain("Updated 1 local state");

		const removed = await server.testInterface.callTool({
			params: { name: "milestone_remove", arguments: { name: "m-1" } },
		});
		expect(getText(removed.content)).toContain("(m-01)");
		expect(getText(removed.content)).toContain("Cleared milestone for 1 local state");
		const cleared = await server.getState("state-1");
		expect(cleared?.milestone).toBeUndefined();
	});

	it("adds milestones as files with validation", async () => {
		const add = await server.testInterface.callTool({
			params: {
				name: "milestone_add",
				arguments: { name: "Release 1.0" },
			},
		});
		expect(getText(add.content)).toContain('Created milestone "Release 1.0"');
		expect(getText(add.content)).toContain("(m-0)");

		// Check that milestone file was created
		const milestones = await server.filesystem.listMilestones();
		expect(milestones.length).toBe(1);
		expect(milestones[0]?.title).toBe("Release 1.0");
		expect(milestones[0]?.id).toBe("m-0");

		// Duplicate should fail (case-insensitive)
		const duplicate = await server.testInterface.callTool({
			params: {
				name: "milestone_add",
				arguments: { name: " release 1.0 " },
			},
		});
		expect(duplicate.isError).toBe(true);
		expect(getText(duplicate.content)).toContain("Milestone alias conflict");
	});

	it("lists file-based and state-only milestones", async () => {
		await server.testInterface.callTool({
			params: { name: "milestone_add", arguments: { name: "Release 1.0" } },
		});

		await server.testInterface.callTool({
			params: {
				name: "state_create",
				arguments: { title: "Unconfigured milestone state", milestone: "Unconfigured" },
			},
		});

		const list = await server.testInterface.callTool({
			params: { name: "milestone_list", arguments: {} },
		});
		const text = getText(list.content);
		expect(text).toContain("Milestones (1):");
		expect(text).toContain("m-0: Release 1.0");
		expect(text).toContain("Milestones found on states without files (1):");
		expect(text).toContain("- Unconfigured");
	});

	it("archives milestones and hides them from lists", async () => {
		await server.testInterface.callTool({
			params: { name: "milestone_add", arguments: { name: "Release 1.0" } },
		});
		await server.testInterface.callTool({
			params: {
				name: "state_create",
				arguments: { title: "Archived milestone state", milestone: "Release 1.0" },
			},
		});

		const archived = await server.testInterface.callTool({
			params: { name: "milestone_archive", arguments: { name: "Release 1.0" } },
		});
		expect(getText(archived.content)).toContain('Archived milestone "Release 1.0"');

		await server.testInterface.callTool({
			params: { name: "state_edit", arguments: { id: "state-1", milestone: "Release 1.0" } },
		});
		const archivedTitleResolved = await server.getState("state-1");
		expect(archivedTitleResolved?.milestone).toBe("m-0");

		const active = await server.filesystem.listMilestones();
		const archivedList = await server.filesystem.listArchivedMilestones();
		expect(active.length).toBe(0);
		expect(archivedList.length).toBe(1);

		const list = await server.testInterface.callTool({
			params: { name: "milestone_list", arguments: {} },
		});
		const text = getText(list.content);
		expect(text).toContain("Milestones (0):");
		expect(text).toContain("Milestones found on states without files (0):");
		expect(text).toContain("Archived milestone values still on states (1):");
		expect(text).toContain("- m-0");
		expect(text).not.toContain("Release 1.0");
	});

	it("does not reuse archived milestone IDs when adding new milestones", async () => {
		await server.testInterface.callTool({
			params: { name: "milestone_add", arguments: { name: "Release 1.0" } },
		});
		await server.testInterface.callTool({
			params: { name: "milestone_archive", arguments: { name: "Release 1.0" } },
		});

		const added = await server.testInterface.callTool({
			params: { name: "milestone_add", arguments: { name: "Release 2.0" } },
		});
		expect(getText(added.content)).toContain("(m-1)");

		const activeMilestones = await server.filesystem.listMilestones();
		const archivedMilestones = await server.filesystem.listArchivedMilestones();
		expect(activeMilestones[0]?.id).toBe("m-1");
		expect(archivedMilestones[0]?.id).toBe("m-0");
	});

	it("renames milestones and updates local states by default", async () => {
		await server.testInterface.callTool({
			params: { name: "milestone_add", arguments: { name: "Release 1.0" } },
		});
		await server.testInterface.callTool({
			params: { name: "state_create", arguments: { title: "A", milestone: "Release 1.0" } },
		});
		await server.testInterface.callTool({
			params: { name: "state_create", arguments: { title: "B", milestone: "Release 1.0" } },
		});

		const rename = await server.testInterface.callTool({
			params: {
				name: "milestone_rename",
				arguments: { from: "Release 1.0", to: "Release 2.0" },
			},
		});
		expect(getText(rename.content)).toContain('Renamed milestone "Release 1.0" (m-0) → "Release 2.0" (m-0).');
		expect(getText(rename.content)).toContain("Updated 2 local states");
		expect(getText(rename.content)).toContain("Renamed milestone file:");

		const state1 = await server.getState("state-1");
		const state2 = await server.getState("state-2");
		expect(state1?.milestone).toBe("m-0");
		expect(state2?.milestone).toBe("m-0");

		const milestones = await server.filesystem.listMilestones();
		expect(milestones[0]?.title).toBe("Release 2.0");

		const milestoneFiles = await Array.fromAsync(
			new Bun.Glob("m-*.md").scan({ cwd: server.filesystem.milestonesDir, followSymlinks: true }),
		);
		expect(milestoneFiles).toContain("m-0 - release-2.0.md");
		expect(milestoneFiles).not.toContain("m-0 - release-1.0.md");
	});

	it("keeps git clean when renaming milestones with autoCommit enabled", async () => {
		await server.testInterface.callTool({
			params: { name: "milestone_add", arguments: { name: "Release 1.0" } },
		});
		const config = await loadConfigOrThrow(server);
		config.autoCommit = true;
		await server.filesystem.saveConfig(config);
		await server.ensureConfigLoaded();

		await $`git add .`.cwd(TEST_DIR).quiet();
		await $`git commit -m "baseline"`.cwd(TEST_DIR).quiet();

		const rename = await server.testInterface.callTool({
			params: {
				name: "milestone_rename",
				arguments: { from: "Release 1.0", to: "Release 2.0", updateStates: false },
			},
		});
		expect(getText(rename.content)).toContain('Renamed milestone "Release 1.0" (m-0) → "Release 2.0" (m-0).');

		const status = await server.git.getStatus();
		expect(status.trim()).toBe("");
		const lastCommit = await server.git.getLastCommitMessage();
		expect(lastCommit).toContain("roadmap: Rename milestone m-0");
	});

	it("only rewrites the default description section when renaming milestones", async () => {
		await server.testInterface.callTool({
			params: { name: "milestone_add", arguments: { name: "Release 1.0" } },
		});

		const milestoneFilesBefore = await Array.fromAsync(
			new Bun.Glob("m-*.md").scan({ cwd: server.filesystem.milestonesDir, followSymlinks: true }),
		);
		expect(milestoneFilesBefore).toHaveLength(1);
		const sourcePath = join(server.filesystem.milestonesDir, milestoneFilesBefore[0] as string);
		const originalContent = await Bun.file(sourcePath).text();
		const notesLine = "Keep reference Milestone: Release 1.0 in notes";
		await Bun.write(sourcePath, `${originalContent.trimEnd()}\n\n## Notes\n\n${notesLine}\n`);

		const rename = await server.testInterface.callTool({
			params: {
				name: "milestone_rename",
				arguments: { from: "Release 1.0", to: "Release 2.0", updateStates: false },
			},
		});
		expect(getText(rename.content)).toContain('Renamed milestone "Release 1.0" (m-0) → "Release 2.0" (m-0).');

		const renamedPath = join(server.filesystem.milestonesDir, "m-0 - release-2.0.md");
		const updatedContent = await Bun.file(renamedPath).text();
		expect(updatedContent).toContain("## Description\n\nMilestone: Release 2.0");
		expect(updatedContent).toContain(`## Notes\n\n${notesLine}`);
		expect(updatedContent).not.toContain("## Notes\n\nKeep reference Milestone: Release 2.0 in notes");
	});

	it("treats no-op milestone renames as successful without creating commits", async () => {
		await server.testInterface.callTool({
			params: { name: "milestone_add", arguments: { name: "Release 1.0" } },
		});
		const config = await loadConfigOrThrow(server);
		config.autoCommit = true;
		await server.filesystem.saveConfig(config);
		await server.ensureConfigLoaded();

		await $`git add .`.cwd(TEST_DIR).quiet();
		await $`git commit -m "baseline"`.cwd(TEST_DIR).quiet();

		const rename = await server.testInterface.callTool({
			params: {
				name: "milestone_rename",
				arguments: { from: "Release 1.0", to: "Release 1.0", updateStates: false },
			},
		});
		expect(getText(rename.content)).toContain("No changes made");

		const status = await server.git.getStatus();
		expect(status.trim()).toBe("");
		const lastCommit = await server.git.getLastCommitMessage();
		expect(lastCommit).toBe("baseline");
	});

	it("does not include unrelated staged files in milestone auto-commits", async () => {
		await server.testInterface.callTool({
			params: { name: "milestone_add", arguments: { name: "Release 1.0" } },
		});
		const config = await loadConfigOrThrow(server);
		config.autoCommit = true;
		await server.filesystem.saveConfig(config);
		await server.ensureConfigLoaded();

		await $`git add .`.cwd(TEST_DIR).quiet();
		await $`git commit -m "baseline"`.cwd(TEST_DIR).quiet();

		await Bun.write(join(TEST_DIR, "UNRELATED.txt"), "keep staged\n");
		await $`git add UNRELATED.txt`.cwd(TEST_DIR).quiet();

		const rename = await server.testInterface.callTool({
			params: {
				name: "milestone_rename",
				arguments: { from: "Release 1.0", to: "Release 2.0", updateStates: false },
			},
		});
		expect(getText(rename.content)).toContain('Renamed milestone "Release 1.0" (m-0) → "Release 2.0" (m-0).');

		const lastCommit = await server.git.getLastCommitMessage();
		expect(lastCommit).toContain("roadmap: Rename milestone m-0");

		const { stdout: committedFiles } = await $`git show --name-only --pretty=format:`.cwd(TEST_DIR).quiet();
		expect(committedFiles).not.toContain("UNRELATED.txt");
		const status = await server.git.getStatus();
		expect(status).toContain("A  UNRELATED.txt");
	});

	it("does not include unrelated staged files in milestone archive auto-commits", async () => {
		await server.testInterface.callTool({
			params: { name: "milestone_add", arguments: { name: "Release 1.0" } },
		});
		const config = await loadConfigOrThrow(server);
		config.autoCommit = true;
		await server.filesystem.saveConfig(config);
		await server.ensureConfigLoaded();

		await $`git add .`.cwd(TEST_DIR).quiet();
		await $`git commit -m "baseline"`.cwd(TEST_DIR).quiet();

		await Bun.write(join(TEST_DIR, "UNRELATED.txt"), "keep staged\n");
		await $`git add UNRELATED.txt`.cwd(TEST_DIR).quiet();

		const archived = await server.testInterface.callTool({
			params: { name: "milestone_archive", arguments: { name: "Release 1.0" } },
		});
		expect(getText(archived.content)).toContain('Archived milestone "Release 1.0"');

		const lastCommit = await server.git.getLastCommitMessage();
		expect(lastCommit).toContain("roadmap: Archive milestone m-0");

		const { stdout: committedFiles } = await $`git show --name-only --pretty=format:`.cwd(TEST_DIR).quiet();
		expect(committedFiles).not.toContain("UNRELATED.txt");
		const status = await server.git.getStatus();
		expect(status).toContain("A  UNRELATED.txt");
	});

	it("prefers milestone ID matches over title collisions", async () => {
		await server.testInterface.callTool({
			params: { name: "milestone_add", arguments: { name: "m-1" } },
		});
		await server.testInterface.callTool({
			params: { name: "milestone_add", arguments: { name: "Release B" } },
		});

		await server.testInterface.callTool({
			params: {
				name: "state_create",
				arguments: {
					title: "Collision state",
					milestone: "m-1",
				},
			},
		});

		const state = await server.getState("state-1");
		expect(state?.milestone).toBe("m-1");
	});

	it("supports renaming milestone files without state rewrites when updateStates=false", async () => {
		await server.testInterface.callTool({
			params: { name: "milestone_add", arguments: { name: "Release 1.0" } },
		});
		await server.testInterface.callTool({
			params: { name: "state_create", arguments: { title: "Legacy state", milestone: "Release 1.0" } },
		});
		await server.editState("state-1", { milestone: "Release 1.0" });

		const rename = await server.testInterface.callTool({
			params: {
				name: "milestone_rename",
				arguments: { from: "Release 1.0", to: "Release 2.0", updateStates: false },
			},
		});
		expect(getText(rename.content)).toContain("Skipped updating states (updateStates=false).");

		const state = await server.getState("state-1");
		expect(state?.milestone).toBe("Release 1.0");

		const milestones = await server.filesystem.listMilestones();
		expect(milestones[0]?.title).toBe("Release 2.0");
	});

	it("rejects rename targets that collide with another milestone alias", async () => {
		await server.testInterface.callTool({
			params: { name: "milestone_add", arguments: { name: "Release A" } },
		});
		await server.testInterface.callTool({
			params: { name: "milestone_add", arguments: { name: "Release B" } },
		});

		const rename = await server.testInterface.callTool({
			params: { name: "milestone_rename", arguments: { from: "Release A", to: "m-1" } },
		});
		expect(rename.isError).toBe(true);
		expect(getText(rename.content)).toContain("Milestone alias conflict");
	});

	it("rejects add/rename alias collisions when an existing ID is zero-padded", async () => {
		await writeLegacyMilestoneFile(server, "m-01", "Legacy Release");

		const addCollision = await server.testInterface.callTool({
			params: { name: "milestone_add", arguments: { name: "1" } },
		});
		expect(addCollision.isError).toBe(true);
		expect(getText(addCollision.content)).toContain("Milestone alias conflict");

		await server.testInterface.callTool({
			params: { name: "milestone_add", arguments: { name: "Release B" } },
		});
		const renameCollision = await server.testInterface.callTool({
			params: { name: "milestone_rename", arguments: { from: "Release B", to: "m-1" } },
		});
		expect(renameCollision.isError).toBe(true);
		expect(getText(renameCollision.content)).toContain("Milestone alias conflict");
	});

	it("supports milestone ID inputs for rename/remove", async () => {
		await server.testInterface.callTool({
			params: { name: "milestone_add", arguments: { name: "Release A" } },
		});
		await server.testInterface.callTool({
			params: { name: "milestone_add", arguments: { name: "Release B" } },
		});
		await server.testInterface.callTool({
			params: { name: "state_create", arguments: { title: "State A", milestone: "Release A" } },
		});
		await server.testInterface.callTool({
			params: { name: "state_create", arguments: { title: "State B", milestone: "Release B" } },
		});

		const renamed = await server.testInterface.callTool({
			params: { name: "milestone_rename", arguments: { from: "m-0", to: "Release A Prime" } },
		});
		expect(getText(renamed.content)).toContain('Renamed milestone "Release A" (m-0) → "Release A Prime" (m-0).');
		expect(getText(renamed.content)).toContain("Updated 1 local state");

		const afterRename = await server.getState("state-1");
		expect(afterRename?.milestone).toBe("m-0");

		const removed = await server.testInterface.callTool({
			params: { name: "milestone_remove", arguments: { name: "m-1" } },
		});
		expect(getText(removed.content)).toContain('Removed milestone "Release B" (m-1).');
		expect(getText(removed.content)).toContain("Cleared milestone for 1 local state");

		const afterRemove = await server.getState("state-2");
		expect(afterRemove?.milestone).toBeUndefined();

		const activeMilestones = await server.filesystem.listMilestones();
		const archivedMilestones = await server.filesystem.listArchivedMilestones();
		expect(activeMilestones.map((milestone) => milestone.id)).toEqual(["m-0"]);
		expect(archivedMilestones.map((milestone) => milestone.id)).toContain("m-1");
	});

	it("updates title-based state milestone values when renaming by milestone ID", async () => {
		await server.testInterface.callTool({
			params: { name: "milestone_add", arguments: { name: "Release A" } },
		});
		await server.testInterface.callTool({
			params: { name: "state_create", arguments: { title: "State A", milestone: "Release A" } },
		});
		await server.editState("state-1", { milestone: "Release A" });

		await server.testInterface.callTool({
			params: { name: "milestone_rename", arguments: { from: "m-0", to: "Release A Prime" } },
		});

		const updatedState = await server.getState("state-1");
		expect(updatedState?.milestone).toBe("m-0");
	});

	it("updates numeric alias state milestone values when renaming by title", async () => {
		await server.testInterface.callTool({
			params: { name: "milestone_add", arguments: { name: "Release A" } },
		});
		await server.testInterface.callTool({
			params: { name: "state_create", arguments: { title: "State A", milestone: "Release A" } },
		});
		await server.editState("state-1", { milestone: "0" });

		await server.testInterface.callTool({
			params: { name: "milestone_rename", arguments: { from: "Release A", to: "Release A Prime" } },
		});

		const updatedState = await server.getState("state-1");
		expect(updatedState?.milestone).toBe("m-0");
	});

	it("does not cross-match reused titles when removing by milestone ID", async () => {
		await server.testInterface.callTool({
			params: { name: "milestone_add", arguments: { name: "Shared" } },
		});
		await server.testInterface.callTool({
			params: { name: "milestone_add", arguments: { name: "Keep ID occupied" } },
		});
		await server.testInterface.callTool({
			params: { name: "state_create", arguments: { title: "Old state", milestone: "Shared" } },
		});
		await server.editState("state-1", { milestone: "Shared" });
		await server.testInterface.callTool({
			params: { name: "milestone_archive", arguments: { name: "Shared" } },
		});
		await server.testInterface.callTool({
			params: { name: "milestone_add", arguments: { name: "Shared" } },
		});
		await server.testInterface.callTool({
			params: { name: "state_create", arguments: { title: "New state", milestone: "Shared" } },
		});

		const removeById = await server.testInterface.callTool({
			params: { name: "milestone_remove", arguments: { name: "m-2" } },
		});
		expect(getText(removeById.content)).toContain('Removed milestone "Shared" (m-2).');
		expect(getText(removeById.content)).toContain("Cleared milestone for 1 local state");

		const oldState = await server.getState("state-1");
		const newState = await server.getState("state-2");
		expect(oldState?.milestone).toBe("Shared");
		expect(newState?.milestone).toBeUndefined();
	});

	it("does not cross-match archived milestone IDs when removing a title that looks like an ID", async () => {
		await server.testInterface.callTool({
			params: { name: "milestone_add", arguments: { name: "Archived source" } },
		});
		await server.testInterface.callTool({
			params: { name: "state_create", arguments: { title: "Archived state", milestone: "Archived source" } },
		});
		await server.testInterface.callTool({
			params: { name: "milestone_archive", arguments: { name: "Archived source" } },
		});
		await server.testInterface.callTool({
			params: { name: "milestone_add", arguments: { name: "Keep ID occupied" } },
		});
		await server.testInterface.callTool({
			params: { name: "milestone_add", arguments: { name: "m-0" } },
		});
		await server.testInterface.callTool({
			params: { name: "state_create", arguments: { title: "Active title state", milestone: "m-2" } },
		});
		await server.editState("state-1", { milestone: "0" });

		const removeByTitle = await server.testInterface.callTool({
			params: { name: "milestone_remove", arguments: { name: "m-0" } },
		});
		expect(getText(removeByTitle.content)).toContain("Cleared milestone for 1 local state");

		const archivedState = await server.getState("state-1");
		const activeState = await server.getState("state-2");
		expect(archivedState?.milestone).toBe("0");
		expect(activeState?.milestone).toBeUndefined();
	});

	it("does not cross-match archived milestone IDs when renaming a title that looks like an ID", async () => {
		await server.testInterface.callTool({
			params: { name: "milestone_add", arguments: { name: "Archived source" } },
		});
		await server.testInterface.callTool({
			params: { name: "state_create", arguments: { title: "Archived state", milestone: "Archived source" } },
		});
		await server.testInterface.callTool({
			params: { name: "milestone_archive", arguments: { name: "Archived source" } },
		});
		await server.testInterface.callTool({
			params: { name: "milestone_add", arguments: { name: "Keep ID occupied" } },
		});
		await server.testInterface.callTool({
			params: { name: "milestone_add", arguments: { name: "m-0" } },
		});
		await server.testInterface.callTool({
			params: { name: "state_create", arguments: { title: "Active title state", milestone: "m-2" } },
		});
		await server.editState("state-1", { milestone: "0" });

		const renameByTitle = await server.testInterface.callTool({
			params: { name: "milestone_rename", arguments: { from: "m-0", to: "ID-like title renamed" } },
		});
		expect(getText(renameByTitle.content)).toContain("Updated 1 local state");

		const archivedState = await server.getState("state-1");
		const activeState = await server.getState("state-2");
		expect(archivedState?.milestone).toBe("0");
		expect(activeState?.milestone).toBe("m-2");
	});

	it("prefers canonical IDs when zero-padded and canonical ID files both exist", async () => {
		await writeLegacyMilestoneFile(server, "m-1", "Canonical ID");
		await writeLegacyMilestoneFile(server, "m-01", "Zero-padded ID");

		await server.testInterface.callTool({
			params: {
				name: "state_create",
				arguments: {
					title: "Alias tie-break state",
					milestone: "1",
				},
			},
		});
		const created = await server.getState("state-1");
		expect(created?.milestone).toBe("m-1");

		const renamed = await server.testInterface.callTool({
			params: { name: "milestone_rename", arguments: { from: "1", to: "Canonical ID Prime" } },
		});
		expect(getText(renamed.content)).toContain("(m-1)");
	});

	it("prefers archived milestone IDs over active title matches for ID-like state edits", async () => {
		await server.testInterface.callTool({
			params: { name: "milestone_add", arguments: { name: "Archived source" } },
		});
		await server.testInterface.callTool({
			params: { name: "state_create", arguments: { title: "State", milestone: "Archived source" } },
		});
		await server.testInterface.callTool({
			params: { name: "milestone_archive", arguments: { name: "Archived source" } },
		});
		await server.testInterface.callTool({
			params: { name: "milestone_add", arguments: { name: "Keep ID occupied" } },
		});
		await server.testInterface.callTool({
			params: { name: "milestone_add", arguments: { name: "m-0" } },
		});

		await server.testInterface.callTool({
			params: { name: "state_edit", arguments: { id: "state-1", milestone: "m-0" } },
		});
		const updated = await server.getState("state-1");
		expect(updated?.milestone).toBe("m-0");
	});

	it("reports archived milestone state values when active titles look like archived IDs", async () => {
		await server.testInterface.callTool({
			params: { name: "milestone_add", arguments: { name: "Archived source" } },
		});
		await server.testInterface.callTool({
			params: { name: "state_create", arguments: { title: "State", milestone: "Archived source" } },
		});
		await server.testInterface.callTool({
			params: { name: "milestone_archive", arguments: { name: "Archived source" } },
		});
		await server.testInterface.callTool({
			params: { name: "milestone_add", arguments: { name: "Keep ID occupied" } },
		});
		await server.testInterface.callTool({
			params: { name: "milestone_add", arguments: { name: "m-0" } },
		});
		await server.editState("state-1", { milestone: "m-0" });

		const listed = await server.testInterface.callTool({
			params: { name: "milestone_list", arguments: {} },
		});
		const text = getText(listed.content);
		expect(text).toContain("Archived milestone values still on states (1):");
		expect(text).toContain("- m-0");
	});

	it("treats duplicate active titles as unresolved in milestone_list reporting", async () => {
		await writeLegacyMilestoneFile(server, "m-0", "Shared");
		await writeLegacyMilestoneFile(server, "m-1", "Shared");
		await server.testInterface.callTool({
			params: { name: "state_create", arguments: { title: "Ambiguous title state", milestone: "Shared" } },
		});

		const listed = await server.testInterface.callTool({
			params: { name: "milestone_list", arguments: {} },
		});
		const text = getText(listed.content);
		expect(text).toContain("Milestones found on states without files (1):");
		expect(text).toContain("- Shared");
	});

	it("allocates new milestone IDs from milestone frontmatter IDs before filename IDs", async () => {
		await Bun.write(
			join(server.filesystem.milestonesDir, "m-0 - mismatched-frontmatter-id.md"),
			`---
id: m-7
title: "Legacy frontmatter ID"
---

## Description

Milestone: Legacy frontmatter ID
`,
		);

		const add = await server.testInterface.callTool({
			params: { name: "milestone_add", arguments: { name: "Next release" } },
		});
		expect(getText(add.content)).toContain("(m-8)");
	});

	it("treats reused title input as the active milestone", async () => {
		await server.testInterface.callTool({
			params: { name: "milestone_add", arguments: { name: "Shared" } },
		});
		await server.testInterface.callTool({
			params: { name: "milestone_add", arguments: { name: "Keep ID occupied" } },
		});
		await server.testInterface.callTool({
			params: { name: "state_create", arguments: { title: "Archived state", milestone: "Shared" } },
		});
		await server.testInterface.callTool({
			params: { name: "milestone_archive", arguments: { name: "Shared" } },
		});
		await server.testInterface.callTool({
			params: { name: "milestone_add", arguments: { name: "Shared" } },
		});

		await server.testInterface.callTool({
			params: { name: "state_create", arguments: { title: "Active state", milestone: "Shared" } },
		});
		const activeStateBeforeRemove = await server.getState("state-2");
		expect(activeStateBeforeRemove?.milestone).toBe("m-2");

		await server.testInterface.callTool({
			params: { name: "milestone_remove", arguments: { name: "Shared" } },
		});

		const archivedState = await server.getState("state-1");
		const activeState = await server.getState("state-2");
		expect(archivedState?.milestone).toBe("m-0");
		expect(activeState?.milestone).toBeUndefined();
	});

	it("removes milestones and clears or reassigns local states", async () => {
		await server.testInterface.callTool({
			params: { name: "milestone_add", arguments: { name: "Release A" } },
		});
		await server.testInterface.callTool({
			params: { name: "milestone_add", arguments: { name: "Release B" } },
		});
		await server.testInterface.callTool({
			params: { name: "state_create", arguments: { title: "A", milestone: "Release A" } },
		});

		const reassign = await server.testInterface.callTool({
			params: {
				name: "milestone_remove",
				arguments: { name: "Release A", stateHandling: "reassign", reassignTo: "Release B" },
			},
		});
		expect(getText(reassign.content)).toContain('Removed milestone "Release A" (m-0).');
		expect(getText(reassign.content)).toContain("Reassigned 1 local state");

		const state1 = await server.getState("state-1");
		expect(state1?.milestone).toBe("m-1");

		// Now test clear behavior
		await server.testInterface.callTool({
			params: { name: "state_edit", arguments: { id: "state-1", milestone: "Release B" } },
		});

		const clear = await server.testInterface.callTool({
			params: { name: "milestone_remove", arguments: { name: "Release B" } },
		});
		expect(getText(clear.content)).toContain('Removed milestone "Release B" (m-1).');
		expect(getText(clear.content)).toContain("Cleared milestone for 1 local state");

		const cleared = await server.getState("state-1");
		expect(cleared?.milestone).toBeUndefined();
	});

	it("can remove a milestone file while keeping state milestone values", async () => {
		await server.testInterface.callTool({
			params: { name: "milestone_add", arguments: { name: "Keep Value" } },
		});
		await server.testInterface.callTool({
			params: { name: "state_create", arguments: { title: "State", milestone: "Keep Value" } },
		});

		const removeKeep = await server.testInterface.callTool({
			params: { name: "milestone_remove", arguments: { name: "Keep Value", stateHandling: "keep" } },
		});
		expect(getText(removeKeep.content)).toContain('Removed milestone "Keep Value" (m-0).');
		expect(getText(removeKeep.content)).toContain("Kept state milestone values unchanged (stateHandling=keep).");

		const state = await server.getState("state-1");
		expect(state?.milestone).toBe("m-0");

		const activeMilestones = await server.filesystem.listMilestones();
		const archivedMilestones = await server.filesystem.listArchivedMilestones();
		expect(activeMilestones).toHaveLength(0);
		expect(archivedMilestones).toHaveLength(1);

		const list = await server.testInterface.callTool({
			params: { name: "milestone_list", arguments: {} },
		});
		const text = getText(list.content);
		expect(text).toContain("Milestones found on states without files (0):");
		expect(text).toContain("Archived milestone values still on states (1):");
		expect(text).toContain("- m-0");
	});
});
