import { describe, expect, it } from "bun:test";
import type { McpServer } from "../mcp/server.ts";
import { StateHandlers } from "../mcp/tools/states/handlers.ts";
import type { State } from "../types/index.ts";

const localState: State = {
	id: "state-1",
	title: "Local state",
	status: "To Do",
	assignee: [],
	createdDate: "2025-12-03",
	labels: [],
	dependencies: [],
	source: "local",
};

const remoteState: State = {
	id: "state-2",
	title: "Remote state",
	status: "To Do",
	assignee: [],
	createdDate: "2025-12-03",
	labels: [],
	dependencies: [],
	source: "remote",
};

describe("MCP state tools local filtering", () => {
	const mockConfig = { statuses: ["To Do", "In Progress", "Done"] };

	it("filters cross-branch states out of state_list", async () => {
		const handlers = new StateHandlers({
			queryStates: async () => [localState, remoteState],
			filesystem: {
				loadConfig: async () => mockConfig,
			},
		} as unknown as McpServer);

		const result = await handlers.listStates({});
		const text = (result.content ?? [])
			.map((c) => (typeof c === "object" && c && "text" in c ? c.text : ""))
			.join("\n");

		expect(text).toContain("state-1 - Local state");
		expect(text).not.toContain("state-2 - Remote state");
	});

	it("filters cross-branch states out of state_search", async () => {
		const handlers = new StateHandlers({
			loadStates: async () => [localState, remoteState],
			filesystem: {
				loadConfig: async () => mockConfig,
			},
		} as unknown as McpServer);

		const result = await handlers.searchStates({ query: "state" });
		const text = (result.content ?? [])
			.map((c) => (typeof c === "object" && c && "text" in c ? c.text : ""))
			.join("\n");

		expect(text).toContain("state-1 - Local state");
		expect(text).not.toContain("state-2 - Remote state");
	});
});
