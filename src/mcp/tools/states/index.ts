import type { RoadmapConfig } from "../../../types/index.ts";
import type { McpServer } from "../../server.ts";
import type { McpToolHandler } from "../../types.ts";
import { generateStateCreateSchema, generateStateEditSchema } from "../../utils/schema-generators.ts";
import { createSimpleValidatedTool } from "../../validation/tool-wrapper.ts";
import type { StateCreateArgs, StateEditRequest, StateListArgs, StateSearchArgs } from "./handlers.ts";
import { StateHandlers } from "./handlers.ts";
import { stateArchiveSchema, stateCompleteSchema, stateListSchema, stateSearchSchema, stateViewSchema } from "./schemas.ts";

export function registerStateTools(server: McpServer, config: RoadmapConfig): void {
	const handlers = new StateHandlers(server);

	const stateCreateSchema = generateStateCreateSchema(config);
	const stateEditSchema = generateStateEditSchema(config);

	const createStateTool: McpToolHandler = createSimpleValidatedTool(
		{
			name: "state_create",
			description: "Create a new state using Roadmap.md",
			inputSchema: stateCreateSchema,
		},
		stateCreateSchema,
		async (input) => handlers.createState(input as StateCreateArgs),
	);

	const listStateTool: McpToolHandler = createSimpleValidatedTool(
		{
			name: "state_list",
			description: "List Roadmap.md states from with optional filtering",
			inputSchema: stateListSchema,
		},
		stateListSchema,
		async (input) => handlers.listStates(input as StateListArgs),
	);

	const searchStateTool: McpToolHandler = createSimpleValidatedTool(
		{
			name: "state_search",
			description: "Search Roadmap.md states by title and description",
			inputSchema: stateSearchSchema,
		},
		stateSearchSchema,
		async (input) => handlers.searchStates(input as StateSearchArgs),
	);

	const editStateTool: McpToolHandler = createSimpleValidatedTool(
		{
			name: "state_edit",
			description:
				"Edit a Roadmap.md state, including metadata, implementation plan/notes, dependencies, acceptance criteria, and state-specific Definition of Done items",
			inputSchema: stateEditSchema,
		},
		stateEditSchema,
		async (input) => handlers.editState(input as unknown as StateEditRequest),
	);

	const viewStateTool: McpToolHandler = createSimpleValidatedTool(
		{
			name: "state_view",
			description: "View a Roadmap.md state details",
			inputSchema: stateViewSchema,
		},
		stateViewSchema,
		async (input) => handlers.viewState(input as { id: string }),
	);

	const archiveStateTool: McpToolHandler = createSimpleValidatedTool(
		{
			name: "state_archive",
			description: "Archive a Roadmap.md state",
			inputSchema: stateArchiveSchema,
		},
		stateArchiveSchema,
		async (input) => handlers.archiveState(input as { id: string }),
	);

	const completeStateTool: McpToolHandler = createSimpleValidatedTool(
		{
			name: "state_complete",
			description: "Complete a Roadmap.md state (move it to the completed folder)",
			inputSchema: stateCompleteSchema,
		},
		stateCompleteSchema,
		async (input) => handlers.completeState(input as { id: string }),
	);

	server.addTool(createStateTool);
	server.addTool(listStateTool);
	server.addTool(searchStateTool);
	server.addTool(editStateTool);
	server.addTool(viewStateTool);
	server.addTool(archiveStateTool);
	server.addTool(completeStateTool);
}

export type { StateCreateArgs, StateEditArgs, StateListArgs, StateSearchArgs } from "./handlers.ts";
export { stateArchiveSchema, stateCompleteSchema, stateListSchema, stateSearchSchema, stateViewSchema } from "./schemas.ts";
