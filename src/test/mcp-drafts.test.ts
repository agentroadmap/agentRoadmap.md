import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { $ } from "bun";
import { McpServer } from "../mcp/server.ts";
import { registerStateTools } from "../mcp/tools/states/index.ts";
import { createUniqueTestDir, safeCleanup } from "./test-utils.ts";

const getText = (content: unknown[] | undefined, index = 0): string => {
	const item = content?.[index] as { text?: string } | undefined;
	return item?.text ?? "";
};

let TEST_DIR: string;
let mcpServer: McpServer;

async function loadConfig(server: McpServer) {
	const config = await server.filesystem.loadConfig();
	if (!config) {
		throw new Error("Failed to load roadmap configuration for tests");
	}
	return config;
}

describe("MCP draft support via state tools", () => {
	beforeEach(async () => {
		TEST_DIR = createUniqueTestDir("mcp-drafts");
		mcpServer = new McpServer(TEST_DIR, "Test instructions");
		await mcpServer.filesystem.ensureRoadmapStructure();

		await $`git init -b main`.cwd(TEST_DIR).quiet();
		await $`git config user.name "Test User"`.cwd(TEST_DIR).quiet();
		await $`git config user.email test@example.com`.cwd(TEST_DIR).quiet();

		await mcpServer.initializeProject("Test Project");

		const config = await loadConfig(mcpServer);
		registerStateTools(mcpServer, config);
	});

	afterEach(async () => {
		try {
			await mcpServer.stop();
		} catch {
			// ignore
		}
		await safeCleanup(TEST_DIR);
	});

	it("creates, lists, and views drafts while excluding them by default", async () => {
		const createResult = await mcpServer.testInterface.callTool({
			params: {
				name: "state_create",
				arguments: {
					title: "Draft state",
					status: "Draft",
				},
			},
		});

		expect(getText(createResult.content)).toContain("State DRAFT-1 - Draft state");

		const draft = await mcpServer.filesystem.loadDraft("draft-1");
		expect(draft).not.toBeNull();

		const listDefault = await mcpServer.testInterface.callTool({
			params: { name: "state_list", arguments: {} },
		});

		const defaultText = getText(listDefault.content);
		expect(defaultText).not.toContain("DRAFT-1");

		const listDrafts = await mcpServer.testInterface.callTool({
			params: { name: "state_list", arguments: { status: "Draft" } },
		});

		const listDraftText = getText(listDrafts.content);
		expect(listDraftText).toContain("Draft:");
		expect(listDraftText).toContain("DRAFT-1 - Draft state");

		const viewDraft = await mcpServer.testInterface.callTool({
			params: { name: "state_view", arguments: { id: "draft-1" } },
		});

		const viewText = getText(viewDraft.content);
		expect(viewText).toContain("State DRAFT-1 - Draft state");
	});

	it("promotes and demotes via state_edit status changes", async () => {
		await mcpServer.testInterface.callTool({
			params: {
				name: "state_create",
				arguments: {
					title: "Promotion candidate",
					status: "Draft",
				},
			},
		});

		const promoteResult = await mcpServer.testInterface.callTool({
			params: {
				name: "state_edit",
				arguments: {
					id: "draft-1",
					status: "To Do",
					title: "Promoted state",
				},
			},
		});

		expect(getText(promoteResult.content)).toContain("State STATE-1 - Promoted state");

		const promoted = await mcpServer.getState("state-1");
		expect(promoted?.status).toBe("To Do");

		const removedDraft = await mcpServer.filesystem.loadDraft("draft-1");
		expect(removedDraft).toBeNull();

		const demoteResult = await mcpServer.testInterface.callTool({
			params: {
				name: "state_edit",
				arguments: {
					id: "state-1",
					status: "Draft",
					title: "Demoted draft",
				},
			},
		});

		const demoteText = getText(demoteResult.content);
		const match = demoteText.match(/State (DRAFT-\d+)/);
		expect(match).not.toBeNull();
		const draftId = match?.[1] ?? "";

		const demotedDraft = await mcpServer.filesystem.loadDraft(draftId);
		expect(demotedDraft?.status).toBe("Draft");
		expect(demotedDraft?.title).toBe("Demoted draft");

		const stateFile = await mcpServer.filesystem.loadState("state-1");
		expect(stateFile).toBeNull();
	});

	it("searches and archives drafts when requested", async () => {
		await mcpServer.testInterface.callTool({
			params: {
				name: "state_create",
				arguments: {
					title: "Archive this draft",
					status: "Draft",
				},
			},
		});

		const searchResult = await mcpServer.testInterface.callTool({
			params: {
				name: "state_search",
				arguments: {
					query: "Archive",
					status: "Draft",
				},
			},
		});

		const searchText = getText(searchResult.content);
		expect(searchText).toContain("DRAFT-1 - Archive this draft");

		await mcpServer.testInterface.callTool({
			params: { name: "state_archive", arguments: { id: "draft-1" } },
		});

		const archivedDraft = await mcpServer.filesystem.loadDraft("draft-1");
		expect(archivedDraft).toBeNull();

		const archiveDir = join(TEST_DIR, "roadmap", "archive", "drafts");
		const archiveFiles = await readdir(archiveDir);
		expect(archiveFiles.some((file) => file.startsWith("draft-1"))).toBe(true);
	});
});
