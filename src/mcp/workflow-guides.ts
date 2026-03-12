import {
	MCP_STATE_CREATION_GUIDE,
	MCP_STATE_EXECUTION_GUIDE,
	MCP_STATE_FINALIZATION_GUIDE,
	MCP_WORKFLOW_OVERVIEW,
	MCP_WORKFLOW_OVERVIEW_TOOLS,
} from "../guidelines/mcp/index.ts";

export interface WorkflowGuideDefinition {
	key: "overview" | "state-creation" | "state-execution" | "state-finalization";
	uri: string;
	name: string;
	description: string;
	mimeType: string;
	resourceText: string;
	toolText?: string;
	toolName: string;
	toolDescription: string;
}

export const WORKFLOW_GUIDES: WorkflowGuideDefinition[] = [
	{
		key: "overview",
		uri: "roadmap://workflow/overview",
		name: "Roadmap Workflow Overview",
		description: "Overview of when and how to use Roadmap.md for state management",
		mimeType: "text/markdown",
		resourceText: MCP_WORKFLOW_OVERVIEW,
		toolText: MCP_WORKFLOW_OVERVIEW_TOOLS,
		toolName: "get_workflow_overview",
		toolDescription: "Retrieve the Roadmap.md workflow overview guidance in markdown format",
	},
	{
		key: "state-creation",
		uri: "roadmap://workflow/state-creation",
		name: "State Creation Guide",
		description: "Detailed guide for creating states: scope assessment, acceptance criteria, parent/substates",
		mimeType: "text/markdown",
		resourceText: MCP_STATE_CREATION_GUIDE,
		toolName: "get_state_creation_guide",
		toolDescription: "Retrieve the Roadmap.md state creation guide in markdown format",
	},
	{
		key: "state-execution",
		uri: "roadmap://workflow/state-execution",
		name: "State Execution Guide",
		description: "Detailed guide for planning and executing states: workflow, discipline, scope changes",
		mimeType: "text/markdown",
		resourceText: MCP_STATE_EXECUTION_GUIDE,
		toolName: "get_state_execution_guide",
		toolDescription: "Retrieve the Roadmap.md state execution guide in markdown format",
	},
	{
		key: "state-finalization",
		uri: "roadmap://workflow/state-finalization",
		name: "State Finalization Guide",
		description: "Detailed guide for finalizing states: Definition of Done, finalization workflow, next steps",
		mimeType: "text/markdown",
		resourceText: MCP_STATE_FINALIZATION_GUIDE,
		toolName: "get_state_finalization_guide",
		toolDescription: "Retrieve the Roadmap.md state finalization guide in markdown format",
	},
];

export function getWorkflowGuideByUri(uri: string): WorkflowGuideDefinition | undefined {
	return WORKFLOW_GUIDES.find((guide) => guide.uri === uri);
}
