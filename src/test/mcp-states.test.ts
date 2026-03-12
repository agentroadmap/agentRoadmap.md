import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { $ } from "bun";
import { DEFAULT_STATUSES } from "../constants/index.ts";
import { McpServer } from "../mcp/server.ts";
import { registerStateTools } from "../mcp/tools/states/index.ts";
import type { JsonSchema } from "../mcp/validation/validators.ts";
import { createUniqueTestDir, safeCleanup } from "./test-utils.ts";

// Helper to extract text from MCP content (handles union types)
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

describe("MCP state tools (MVP)", () => {
	beforeEach(async () => {
		TEST_DIR = createUniqueTestDir("mcp-states");
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

	it("creates and lists states", async () => {
		const createResult = await mcpServer.testInterface.callTool({
			params: {
				name: "state_create",
				arguments: {
					title: "Agent onboarding checklist",
					description: "Steps to onboard a new AI agent",
					labels: ["agents", "workflow"],
					priority: "high",
					acceptanceCriteria: ["Credentials provisioned", "Documentation shared"],
				},
			},
		});

		expect(getText(createResult.content)).toContain("State STATE-1 - Agent onboarding checklist");

		const listResult = await mcpServer.testInterface.callTool({
			params: { name: "state_list", arguments: { search: "onboarding" } },
		});

		const listText = (listResult.content ?? []).map((entry) => ("text" in entry ? entry.text : "")).join("\n\n");
		expect(listText).toContain("To Do:");
		expect(listText).toContain("[HIGH] STATE-1 - Agent onboarding checklist");
		expect(listText).not.toContain("Implementation Plan:");
		expect(listText).not.toContain("Acceptance Criteria:");

		const searchResult = await mcpServer.testInterface.callTool({
			params: { name: "state_search", arguments: { query: "agent" } },
		});

		const searchText = getText(searchResult.content);
		expect(searchText).toContain("States:");
		expect(searchText).toContain("STATE-1 - Agent onboarding checklist");
		expect(searchText).toContain("(To Do)");
		expect(searchText).not.toContain("Implementation Plan:");
	});

	it("filters state_list by milestone using closest matching and combines with status", async () => {
		await mcpServer.testInterface.callTool({
			params: {
				name: "state_create",
				arguments: {
					title: "Milestone State One",
					status: "To Do",
					milestone: "Release-1",
				},
			},
		});
		await mcpServer.testInterface.callTool({
			params: {
				name: "state_create",
				arguments: {
					title: "Milestone State Two",
					status: "In Progress",
					milestone: "release-1",
				},
			},
		});
		await mcpServer.testInterface.callTool({
			params: {
				name: "state_create",
				arguments: {
					title: "Other Milestone State",
					status: "To Do",
					milestone: "Release-2",
				},
			},
		});
		await mcpServer.testInterface.callTool({
			params: {
				name: "state_create",
				arguments: {
					title: "No Milestone State",
					status: "To Do",
				},
			},
		});
		await mcpServer.testInterface.callTool({
			params: {
				name: "state_create",
				arguments: {
					title: "Roadmap Milestone State",
					status: "To Do",
					milestone: "Roadmap Alpha",
				},
			},
		});

		const milestoneResult = await mcpServer.testInterface.callTool({
			params: { name: "state_list", arguments: { milestone: "RELEASE-1" } },
		});
		const milestoneText = (milestoneResult.content ?? [])
			.map((entry) => ("text" in entry ? entry.text : ""))
			.join("\n\n");
		expect(milestoneText).toContain("STATE-1 - Milestone State One");
		expect(milestoneText).toContain("STATE-2 - Milestone State Two");
		expect(milestoneText).not.toContain("STATE-3 - Other Milestone State");
		expect(milestoneText).not.toContain("STATE-4 - No Milestone State");
		expect(milestoneText).not.toContain("STATE-5 - Roadmap Milestone State");

		const fuzzyResult = await mcpServer.testInterface.callTool({
			params: { name: "state_list", arguments: { milestone: "roadmp" } },
		});
		const fuzzyText = (fuzzyResult.content ?? []).map((entry) => ("text" in entry ? entry.text : "")).join("\n\n");
		expect(fuzzyText).toContain("STATE-5 - Roadmap Milestone State");
		expect(fuzzyText).not.toContain("STATE-1 - Milestone State One");
		expect(fuzzyText).not.toContain("STATE-2 - Milestone State Two");
		expect(fuzzyText).not.toContain("STATE-3 - Other Milestone State");
		expect(fuzzyText).not.toContain("STATE-4 - No Milestone State");

		const combinedResult = await mcpServer.testInterface.callTool({
			params: { name: "state_list", arguments: { milestone: "release-1", status: "To Do" } },
		});
		const combinedText = (combinedResult.content ?? [])
			.map((entry) => ("text" in entry ? entry.text : ""))
			.join("\n\n");
		expect(combinedText).toContain("STATE-1 - Milestone State One");
		expect(combinedText).not.toContain("STATE-2 - Milestone State Two");
		expect(combinedText).not.toContain("STATE-3 - Other Milestone State");
		expect(combinedText).not.toContain("STATE-4 - No Milestone State");
		expect(combinedText).not.toContain("STATE-5 - Roadmap Milestone State");
	});

	it("applies milestone filtering in state_list draft status path", async () => {
		await mcpServer.testInterface.callTool({
			params: {
				name: "state_create",
				arguments: {
					title: "Draft Milestone One",
					status: "Draft",
					milestone: "draft-alpha",
				},
			},
		});
		await mcpServer.testInterface.callTool({
			params: {
				name: "state_create",
				arguments: {
					title: "Draft Milestone Two",
					status: "Draft",
					milestone: "draft-beta",
				},
			},
		});

		const draftResult = await mcpServer.testInterface.callTool({
			params: { name: "state_list", arguments: { status: "Draft", milestone: "draft-alph" } },
		});
		const draftText = getText(draftResult.content);
		expect(draftText).toContain("DRAFT-1 - Draft Milestone One");
		expect(draftText).not.toContain("DRAFT-2 - Draft Milestone Two");
	});

	it("includes completed states in state_search results and excludes archived states", async () => {
		await mcpServer.testInterface.callTool({
			params: {
				name: "state_create",
				arguments: {
					title: "Active state",
				},
			},
		});

		await mcpServer.testInterface.callTool({
			params: {
				name: "state_create",
				arguments: {
					title: "Completed state",
					status: "Done",
				},
			},
		});

		await mcpServer.testInterface.callTool({
			params: {
				name: "state_complete",
				arguments: {
					id: "state-2",
				},
			},
		});

		await mcpServer.testInterface.callTool({
			params: {
				name: "state_create",
				arguments: {
					title: "Archived state",
				},
			},
		});

		await mcpServer.testInterface.callTool({
			params: {
				name: "state_archive",
				arguments: {
					id: "state-3",
				},
			},
		});

		const searchResult = await mcpServer.testInterface.callTool({
			params: { name: "state_search", arguments: { query: "state" } },
		});

		const searchText = getText(searchResult.content);
		expect(searchText).toContain("STATE-2 - Completed state");
		expect(searchText).toContain("(Done)");
		expect(searchText).not.toContain("STATE-3 - Archived state");
	});

	it("exposes status enums and defaults from configuration", async () => {
		const config = await loadConfig(mcpServer);
		const configuredStatuses =
			config.statuses && config.statuses.length > 0 ? [...config.statuses] : Array.from(DEFAULT_STATUSES);
		const normalizedStatuses = configuredStatuses.map((status) => status.trim());
		const hasDraft = normalizedStatuses.some((status) => status.toLowerCase() === "draft");
		const expectedStatuses = hasDraft ? normalizedStatuses : ["Draft", ...normalizedStatuses];
		const tools = await mcpServer.testInterface.listTools();
		const toolByName = new Map(tools.tools.map((tool) => [tool.name, tool]));

		const createSchema = toolByName.get("state_create")?.inputSchema as JsonSchema | undefined;
		const editSchema = toolByName.get("state_edit")?.inputSchema as JsonSchema | undefined;

		const createStatusSchema = createSchema?.properties?.status;
		const editStatusSchema = editSchema?.properties?.status;

		expect(createStatusSchema?.enum).toEqual(expectedStatuses);
		expect(createStatusSchema?.default).toBe(normalizedStatuses[0] ?? DEFAULT_STATUSES[0]);
		expect(createStatusSchema?.enumCaseInsensitive).toBe(true);
		expect(createStatusSchema?.enumNormalizeWhitespace).toBe(true);

		expect(editStatusSchema?.enum).toEqual(expectedStatuses);
		expect(editStatusSchema?.default).toBe(normalizedStatuses[0] ?? DEFAULT_STATUSES[0]);
		expect(editStatusSchema?.enumCaseInsensitive).toBe(true);
		expect(editStatusSchema?.enumNormalizeWhitespace).toBe(true);
	});

	it("describes Definition of Done fields as state-level in schemas", async () => {
		const tools = await mcpServer.testInterface.listTools();
		const toolByName = new Map(tools.tools.map((tool) => [tool.name, tool]));
		const createSchema = toolByName.get("state_create")?.inputSchema as JsonSchema | undefined;
		const editSchema = toolByName.get("state_edit")?.inputSchema as JsonSchema | undefined;

		expect(createSchema?.properties?.definitionOfDoneAdd?.description).toContain("State-specific");
		expect(createSchema?.properties?.disableDefinitionOfDoneDefaults?.description).toContain(
			"definition_of_done_defaults_upsert",
		);
		expect(editSchema?.properties?.definitionOfDoneAdd?.description).toContain("State-specific");
		expect(editSchema?.properties?.definitionOfDoneCheck?.description).toContain("this state");
	});

	it("allows case-insensitive and whitespace-normalized status values", async () => {
		const createResult = await mcpServer.testInterface.callTool({
			params: {
				name: "state_create",
				arguments: {
					title: "Status normalization",
					status: "done",
				},
			},
		});

		const createText = getText(createResult.content);
		expect(createText).toContain("State STATE-1 - Status normalization");

		const createdState = await mcpServer.getState("state-1");
		expect(createdState?.status).toBe("Done");

		const editResult = await mcpServer.testInterface.callTool({
			params: {
				name: "state_edit",
				arguments: {
					id: "state-1",
					status: "inprogress",
				},
			},
		});

		const editText = getText(editResult.content);
		expect(editText).toContain("State STATE-1 - Status normalization");

		const updatedState = await mcpServer.getState("state-1");
		expect(updatedState?.status).toBe("In Progress");
	});

	it("edits states including plan, notes, dependencies, and acceptance criteria", async () => {
		// Seed primary state
		const seedState = await mcpServer.testInterface.callTool({
			params: {
				name: "state_create",
				arguments: {
					title: "Refine MCP documentation",
					status: "To Do",
				},
			},
		});

		expect(getText(seedState.content)).toContain("State STATE-1 - Refine MCP documentation");

		// Create dependency state
		const dependencyState = await mcpServer.testInterface.callTool({
			params: {
				name: "state_create",
				arguments: {
					title: "Placeholder dependency",
				},
			},
		});

		expect(getText(dependencyState.content)).toContain("State STATE-2 - Placeholder dependency");

		const editResult = await mcpServer.testInterface.callTool({
			params: {
				name: "state_edit",
				arguments: {
					id: "state-1",
					status: "In Progress",
					labels: ["docs"],
					assignee: ["technical-writer"],
					dependencies: ["state-2"],
					planSet: "1. Audit existing content\n2. Remove non-MVP sections",
					notesAppend: ["Ensure CLI examples mirror MCP usage"],
					acceptanceCriteriaSet: ["Plan documented"],
					acceptanceCriteriaAdd: ["Agents can follow instructions end-to-end"],
				},
			},
		});

		const editText = getText(editResult.content);
		expect(editText).toContain("Status: ◒ In Progress");
		expect(editText).toContain("Labels: docs");
		expect(editText).toContain("Dependencies: STATE-2");
		expect(editText).toContain("Implementation Plan:");
		expect(editText).toContain("Implementation Notes:");
		expect(editText).toContain("#1 Plan documented");
		expect(editText).toContain("#2 Agents can follow instructions end-to-end");

		// Uncheck criteria via state_edit
		const criteriaUpdate = await mcpServer.testInterface.callTool({
			params: {
				name: "state_edit",
				arguments: {
					id: "state-1",
					acceptanceCriteriaCheck: [1],
					acceptanceCriteriaUncheck: [2],
				},
			},
		});

		const criteriaText = getText(criteriaUpdate.content);
		expect(criteriaText).toContain("- [x] #1 Plan documented");
		expect(criteriaText).toContain("- [ ] #2 Agents can follow instructions end-to-end");
	});

	it("creates and edits Definition of Done items", async () => {
		const config = await loadConfig(mcpServer);
		config.definitionOfDone = ["Run tests", "Update docs"];
		await mcpServer.filesystem.saveConfig(config);

		const createResult = await mcpServer.testInterface.callTool({
			params: {
				name: "state_create",
				arguments: {
					title: "DoD MCP state",
					definitionOfDoneAdd: ["Ship notes"],
				},
			},
		});

		const createText = getText(createResult.content);
		expect(createText).toContain("Definition of Done:");
		expect(createText).toContain("- [ ] #1 Run tests");
		expect(createText).toContain("- [ ] #2 Update docs");
		expect(createText).toContain("- [ ] #3 Ship notes");

		const disableResult = await mcpServer.testInterface.callTool({
			params: {
				name: "state_create",
				arguments: {
					title: "DoD no defaults",
					disableDefinitionOfDoneDefaults: true,
				},
			},
		});

		const disableText = getText(disableResult.content);
		expect(disableText).toContain("Definition of Done:");
		expect(disableText).toContain("No Definition of Done items defined");

		const checkResult = await mcpServer.testInterface.callTool({
			params: {
				name: "state_edit",
				arguments: {
					id: "state-1",
					definitionOfDoneCheck: [2],
				},
			},
		});

		const checkText = getText(checkResult.content);
		expect(checkText).toContain("- [x] #2 Update docs");

		const removeResult = await mcpServer.testInterface.callTool({
			params: {
				name: "state_edit",
				arguments: {
					id: "state-1",
					definitionOfDoneRemove: [1],
				},
			},
		});

		const removeText = getText(removeResult.content);
		expect(removeText).toContain("- [x] #1 Update docs");

		const uncheckResult = await mcpServer.testInterface.callTool({
			params: {
				name: "state_edit",
				arguments: {
					id: "state-1",
					definitionOfDoneUncheck: [1],
				},
			},
		});

		const uncheckText = getText(uncheckResult.content);
		expect(uncheckText).toContain("- [ ] #1 Update docs");
	});

	it("includes substate list in state_view output and hides it when empty", async () => {
		await mcpServer.testInterface.callTool({
			params: {
				name: "state_create",
				arguments: {
					title: "Parent state",
				},
			},
		});

		await mcpServer.testInterface.callTool({
			params: {
				name: "state_create",
				arguments: {
					title: "Child state A",
					parentStateId: "STATE-1",
				},
			},
		});

		await mcpServer.testInterface.callTool({
			params: {
				name: "state_create",
				arguments: {
					title: "Child state B",
					parentStateId: "STATE-1",
				},
			},
		});

		await mcpServer.testInterface.callTool({
			params: {
				name: "state_create",
				arguments: {
					title: "Standalone state",
				},
			},
		});

		const parentView = await mcpServer.testInterface.callTool({
			params: { name: "state_view", arguments: { id: "state-1" } },
		});

		const parentText = getText(parentView.content);
		expect(parentText).toContain("Substates (2):");
		expect(parentText).toContain("- STATE-1.1 - Child state A");
		expect(parentText).toContain("- STATE-1.2 - Child state B");
		expect(parentText.indexOf("STATE-1.1")).toBeLessThan(parentText.indexOf("STATE-1.2"));

		await mcpServer.testInterface.callTool({
			params: {
				name: "state_edit",
				arguments: {
					id: "state-1.1",
					title: "Child state A updated",
				},
			},
		});

		const parentAfterEdit = await mcpServer.testInterface.callTool({
			params: { name: "state_view", arguments: { id: "state-1" } },
		});

		const parentAfterEditText = getText(parentAfterEdit.content);
		expect(parentAfterEditText).toContain("- STATE-1.1 - Child state A updated");

		const standaloneView = await mcpServer.testInterface.callTool({
			params: { name: "state_view", arguments: { id: "state-2" } },
		});

		const standaloneText = getText(standaloneView.content);
		expect(standaloneText).not.toContain("Substates (");
		expect(standaloneText).not.toContain("Substates:");
	});
});
