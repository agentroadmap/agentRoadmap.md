import chatSkill from "./chat-skill.md" with { type: "text" };
import initRequired from "./init-required.md" with { type: "text" };
import overviewResources from "./overview.md" with { type: "text" };
import overviewTools from "./overview-tools.md" with { type: "text" };
import stateCreation from "./state-creation.md" with { type: "text" };
import stateExecution from "./state-execution.md" with { type: "text" };
import stateFinalization from "./state-finalization.md" with { type: "text" };

export const MCP_WORKFLOW_OVERVIEW = overviewResources.trim();
export const MCP_WORKFLOW_OVERVIEW_TOOLS = overviewTools.trim();
export const MCP_STATE_CREATION_GUIDE = stateCreation.trim();
export const MCP_STATE_EXECUTION_GUIDE = stateExecution.trim();
export const MCP_STATE_FINALIZATION_GUIDE = stateFinalization.trim();
export const MCP_INIT_REQUIRED_GUIDE = initRequired.trim();
export const MCP_CHAT_SKILL = chatSkill.trim();
