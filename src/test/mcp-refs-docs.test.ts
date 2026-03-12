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

describe("MCP state references and documentation", () => {
	beforeEach(async () => {
		TEST_DIR = createUniqueTestDir("mcp-refs-docs");
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

	describe("state_create with references", () => {
		it("creates state with references", async () => {
			const result = await mcpServer.testInterface.callTool({
				params: {
					name: "state_create",
					arguments: {
						title: "Feature with refs",
						references: ["https://github.com/issue/123", "src/api.ts"],
					},
				},
			});

			const text = getText(result.content);
			expect(text).toContain("State STATE-1 - Feature with refs");
			expect(text).toContain("References: https://github.com/issue/123, src/api.ts");
		});

		it("creates state without references", async () => {
			const result = await mcpServer.testInterface.callTool({
				params: {
					name: "state_create",
					arguments: {
						title: "Feature without refs",
					},
				},
			});

			const text = getText(result.content);
			expect(text).toContain("State STATE-1 - Feature without refs");
			expect(text).not.toContain("References:");
		});
	});

	describe("state_create with documentation", () => {
		it("creates state with documentation", async () => {
			const result = await mcpServer.testInterface.callTool({
				params: {
					name: "state_create",
					arguments: {
						title: "Feature with docs",
						documentation: ["https://design-docs.example.com", "docs/spec.md"],
					},
				},
			});

			const text = getText(result.content);
			expect(text).toContain("State STATE-1 - Feature with docs");
			expect(text).toContain("Documentation: https://design-docs.example.com, docs/spec.md");
		});

		it("creates state without documentation", async () => {
			const result = await mcpServer.testInterface.callTool({
				params: {
					name: "state_create",
					arguments: {
						title: "Feature without docs",
					},
				},
			});

			const text = getText(result.content);
			expect(text).toContain("State STATE-1 - Feature without docs");
			expect(text).not.toContain("Documentation:");
		});
	});

	describe("state_create with both references and documentation", () => {
		it("creates state with both fields", async () => {
			const result = await mcpServer.testInterface.callTool({
				params: {
					name: "state_create",
					arguments: {
						title: "Feature with both",
						references: ["https://github.com/issue/123"],
						documentation: ["https://design-docs.example.com"],
					},
				},
			});

			const text = getText(result.content);
			expect(text).toContain("State STATE-1 - Feature with both");
			expect(text).toContain("References: https://github.com/issue/123");
			expect(text).toContain("Documentation: https://design-docs.example.com");
		});
	});

	describe("state_edit with references", () => {
		it("sets references on existing state", async () => {
			await mcpServer.testInterface.callTool({
				params: {
					name: "state_create",
					arguments: { title: "State to edit" },
				},
			});

			const result = await mcpServer.testInterface.callTool({
				params: {
					name: "state_edit",
					arguments: {
						id: "state-1",
						references: ["https://example.com", "file.ts"],
					},
				},
			});

			const text = getText(result.content);
			expect(text).toContain("References: https://example.com, file.ts");
		});

		it("adds references to existing state", async () => {
			await mcpServer.testInterface.callTool({
				params: {
					name: "state_create",
					arguments: {
						title: "State with refs",
						references: ["file1.ts"],
					},
				},
			});

			const result = await mcpServer.testInterface.callTool({
				params: {
					name: "state_edit",
					arguments: {
						id: "state-1",
						addReferences: ["file2.ts", "file3.ts"],
					},
				},
			});

			const text = getText(result.content);
			expect(text).toContain("References: file1.ts, file2.ts, file3.ts");
		});

		it("removes references from existing state", async () => {
			await mcpServer.testInterface.callTool({
				params: {
					name: "state_create",
					arguments: {
						title: "State with refs",
						references: ["file1.ts", "file2.ts", "file3.ts"],
					},
				},
			});

			const result = await mcpServer.testInterface.callTool({
				params: {
					name: "state_edit",
					arguments: {
						id: "state-1",
						removeReferences: ["file2.ts"],
					},
				},
			});

			const text = getText(result.content);
			expect(text).toContain("References: file1.ts, file3.ts");
			expect(text).not.toContain("file2.ts");
		});
	});

	describe("state_edit with documentation", () => {
		it("sets documentation on existing state", async () => {
			await mcpServer.testInterface.callTool({
				params: {
					name: "state_create",
					arguments: { title: "State to edit" },
				},
			});

			const result = await mcpServer.testInterface.callTool({
				params: {
					name: "state_edit",
					arguments: {
						id: "state-1",
						documentation: ["https://docs.example.com", "README.md"],
					},
				},
			});

			const text = getText(result.content);
			expect(text).toContain("Documentation: https://docs.example.com, README.md");
		});

		it("adds documentation to existing state", async () => {
			await mcpServer.testInterface.callTool({
				params: {
					name: "state_create",
					arguments: {
						title: "State with docs",
						documentation: ["doc1.md"],
					},
				},
			});

			const result = await mcpServer.testInterface.callTool({
				params: {
					name: "state_edit",
					arguments: {
						id: "state-1",
						addDocumentation: ["doc2.md", "doc3.md"],
					},
				},
			});

			const text = getText(result.content);
			expect(text).toContain("Documentation: doc1.md, doc2.md, doc3.md");
		});

		it("removes documentation from existing state", async () => {
			await mcpServer.testInterface.callTool({
				params: {
					name: "state_create",
					arguments: {
						title: "State with docs",
						documentation: ["doc1.md", "doc2.md", "doc3.md"],
					},
				},
			});

			const result = await mcpServer.testInterface.callTool({
				params: {
					name: "state_edit",
					arguments: {
						id: "state-1",
						removeDocumentation: ["doc2.md"],
					},
				},
			});

			const text = getText(result.content);
			expect(text).toContain("Documentation: doc1.md, doc3.md");
			expect(text).not.toContain("doc2.md");
		});
	});

	describe("persistence verification", () => {
		it("persists references and documentation in state", async () => {
			await mcpServer.testInterface.callTool({
				params: {
					name: "state_create",
					arguments: {
						title: "Persistent state",
						references: ["ref1.ts", "ref2.ts"],
						documentation: ["doc1.md", "doc2.md"],
					},
				},
			});

			// Reload state to verify persistence
			const state = await mcpServer.getState("state-1");
			expect(state?.references).toEqual(["ref1.ts", "ref2.ts"]);
			expect(state?.documentation).toEqual(["doc1.md", "doc2.md"]);
		});
	});
});
