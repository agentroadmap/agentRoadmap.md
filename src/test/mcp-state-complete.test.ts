import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { $ } from "bun";
import { McpServer } from "../mcp/server.ts";
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

describe("MCP state_complete", () => {
	beforeEach(async () => {
		TEST_DIR = createUniqueTestDir("mcp-state-complete");
		server = new McpServer(TEST_DIR, "Test instructions");
		await server.filesystem.ensureRoadmapStructure();

		await $`git init -b main`.cwd(TEST_DIR).quiet();
		await $`git config user.name "Test User"`.cwd(TEST_DIR).quiet();
		await $`git config user.email test@example.com`.cwd(TEST_DIR).quiet();

		await server.initializeProject("Test Project");

		const config = await loadConfigOrThrow(server);
		registerStateTools(server, config);
	});

	afterEach(async () => {
		try {
			await server.stop();
		} catch {
			// ignore
		}
		await safeCleanup(TEST_DIR);
	});

	it("moves Done states to the completed folder", async () => {
		await server.testInterface.callTool({
			params: {
				name: "state_create",
				arguments: {
					title: "Done state",
					status: "Done",
				},
			},
		});

		const archiveAttempt = await server.testInterface.callTool({
			params: {
				name: "state_archive",
				arguments: { id: "state-1" },
			},
		});
		expect(archiveAttempt.isError).toBe(true);
		expect(getText(archiveAttempt.content)).toContain("state_complete");

		const complete = await server.testInterface.callTool({
			params: {
				name: "state_complete",
				arguments: { id: "state-1" },
			},
		});
		expect(complete.isError).toBeUndefined();
		expect(getText(complete.content)).toContain("Completed state STATE-1");

		const activeState = await server.filesystem.loadState("state-1");
		expect(activeState).toBeNull();

		const completedFiles = await Array.fromAsync(
			new Bun.Glob("state-1*.md").scan({ cwd: server.filesystem.completedDir, followSymlinks: true }),
		);
		expect(completedFiles.length).toBe(1);
	});

	it("refuses to complete states that are not Done", async () => {
		await server.testInterface.callTool({
			params: {
				name: "state_create",
				arguments: {
					title: "Not done state",
					status: "To Do",
				},
			},
		});

		const complete = await server.testInterface.callTool({
			params: {
				name: "state_complete",
				arguments: { id: "state-1" },
			},
		});
		expect(complete.isError).toBe(true);
		expect(getText(complete.content)).toContain("not Done");
	});
});
