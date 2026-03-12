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
let mcpServer: McpServer;

async function loadConfig(server: McpServer) {
	const config = await server.filesystem.loadConfig();
	if (!config) {
		throw new Error("Failed to load roadmap configuration for tests");
	}
	return config;
}

describe("MCP final summary", () => {
	beforeEach(async () => {
		TEST_DIR = createUniqueTestDir("mcp-final-summary");
		mcpServer = new McpServer(TEST_DIR, "Test instructions");
		await mcpServer.filesystem.ensureRoadmapStructure();

		await $`git init -b main`.cwd(TEST_DIR).quiet();
		await $`git config user.name "Test User"`.cwd(TEST_DIR).quiet();
		await $`git config user.email test@example.com`.cwd(TEST_DIR).quiet();

		await mcpServer.initializeProject("MCP Final Summary Project");

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

	it("supports finalSummary on state_create and state_view output", async () => {
		const createResult = await mcpServer.testInterface.callTool({
			params: {
				name: "state_create",
				arguments: {
					title: "Summarized state",
					finalSummary: "PR-style summary",
				},
			},
		});

		const createText = getText(createResult.content);
		expect(createText).toContain("State STATE-1 - Summarized state");
		expect(createText).toContain("Final Summary:");
		expect(createText).toContain("PR-style summary");

		const createdState = await mcpServer.getState("state-1");
		expect(createdState?.finalSummary).toBe("PR-style summary");

		const viewResult = await mcpServer.testInterface.callTool({
			params: {
				name: "state_view",
				arguments: { id: "state-1" },
			},
		});
		const viewText = getText(viewResult.content);
		expect(viewText).toContain("Final Summary:");
		expect(viewText).toContain("PR-style summary");
	});

	it("supports finalSummary set/append/clear on state_edit", async () => {
		await mcpServer.testInterface.callTool({
			params: {
				name: "state_create",
				arguments: { title: "Editable" },
			},
		});

		await mcpServer.testInterface.callTool({
			params: {
				name: "state_edit",
				arguments: { id: "state-1", finalSummary: "Initial" },
			},
		});

		let state = await mcpServer.getState("state-1");
		expect(state?.finalSummary).toBe("Initial");

		await mcpServer.testInterface.callTool({
			params: {
				name: "state_edit",
				arguments: { id: "state-1", finalSummaryAppend: ["Second", "Third"] },
			},
		});

		state = await mcpServer.getState("state-1");
		expect(state?.finalSummary).toBe("Initial\n\nSecond\n\nThird");

		await mcpServer.testInterface.callTool({
			params: {
				name: "state_edit",
				arguments: { id: "state-1", finalSummaryClear: true },
			},
		});

		state = await mcpServer.getState("state-1");
		expect(state?.finalSummary).toBeUndefined();
	});
});
