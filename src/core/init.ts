import { join } from "node:path";
import { spawn } from "bun";
import {
	type AgentInstructionFile,
	addAgentInstructions,
	ensureMcpGuidelines,
	installClaudeAgent,
} from "../agent-instructions.ts";
import { DEFAULT_INIT_CONFIG } from "../constants/index.ts";
import type { RoadmapConfig, State } from "../types/index.ts";
import type { Core } from "./roadmap.ts";
import { BLUEPRINTS, type BlueprintType } from "./blueprints.ts";

export const MCP_SERVER_NAME = "roadmap";
export const MCP_GUIDE_URL = "https://github.com/MrLesk/Roadmap.md#-mcp-integration-model-context-protocol";

export type IntegrationMode = "mcp" | "cli" | "none";
export type McpClient = "claude" | "codex" | "gemini" | "kiro" | "guide";

export interface InitializeProjectOptions {
	projectName: string;
	description?: string;
	blueprint?: BlueprintType;
	integrationMode: IntegrationMode;
	mcpClients?: McpClient[];
	agentInstructions?: AgentInstructionFile[];
	installClaudeAgent?: boolean;
	advancedConfig?: {
		checkActiveBranches?: boolean;
		remoteOperations?: boolean;
		activeBranchDays?: number;
		bypassGitHooks?: boolean;
		autoCommit?: boolean;
		zeroPaddedIds?: number;
		defaultEditor?: string;
		definitionOfDone?: string[];
		defaultPort?: number;
		autoOpenBrowser?: boolean;
		/** Custom state prefix (e.g., "JIRA"). Only set during first init, read-only after. */
		statePrefix?: string;
	};
	/** Existing config for re-initialization */
	existingConfig?: RoadmapConfig | null;
}

export interface InitializeProjectResult {
	success: boolean;
	projectName: string;
	description?: string;
	blueprint?: BlueprintType;
	isReInitialization: boolean;
	config: RoadmapConfig;
	mcpResults?: Record<string, string>;
	initialStates?: {
		id: string;
		title: string;
	}[];
}

async function runMcpClientCommand(label: string, command: string, args: string[]): Promise<string> {
	try {
		const child = spawn({
			cmd: [command, ...args],
			stdout: "pipe",
			stderr: "pipe",
		});
		const exitCode = await child.exited;
		if (exitCode !== 0) {
			throw new Error(`Command exited with code ${exitCode}`);
		}
		return `Added Roadmap MCP server to ${label}`;
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		throw new Error(
			`Unable to configure ${label} automatically (${message}). Run manually: ${command} ${args.join(" ")}`,
		);
	}
}

/**
 * Core initialization logic shared between CLI and browser.
 * Both CLI and browser validate input before calling this function.
 */
export async function initializeProject(
	core: Core,
	options: InitializeProjectOptions,
): Promise<InitializeProjectResult> {
	const {
		projectName,
		description,
		blueprint: blueprintType,
		integrationMode,
		mcpClients = [],
		agentInstructions = [],
		installClaudeAgent: installClaudeAgentFlag = false,
		advancedConfig = {},
		existingConfig,
	} = options;

	const isReInitialization = !!existingConfig;
	const projectRoot = core.filesystem.rootDir;
	const hasDefaultEditorOverride = Object.hasOwn(advancedConfig, "defaultEditor");
	const hasZeroPaddedIdsOverride = Object.hasOwn(advancedConfig, "zeroPaddedIds");
	const hasDefinitionOfDoneOverride = Object.hasOwn(advancedConfig, "definitionOfDone");

	// Build config, preserving existing values for re-initialization.
	// Re-init should be idempotent for fields that init does not explicitly manage.
	const d = DEFAULT_INIT_CONFIG;
	const baseConfig: RoadmapConfig = {
		projectName,
		statuses: ["To Do", "In Progress", "Done"],
		labels: [],
		defaultStatus: "To Do",
		dateFormat: "yyyy-mm-dd",
		maxColumnWidth: 20,
		autoCommit: true, // Default to true for agent orchestration
		remoteOperations: true,
		bypassGitHooks: false,
		checkActiveBranches: true,
		activeBranchDays: 30,
		defaultPort: 6420,
		autoOpenBrowser: true,
		stateResolutionStrategy: existingConfig?.stateResolutionStrategy || "most_recent",
		// Preserve existing prefixes on re-init, or use custom prefix if provided during first init
		prefixes: existingConfig?.prefixes || {
			state: advancedConfig.statePrefix || "state",
		},
	};
	
	const config: RoadmapConfig = {
		...baseConfig,
		...(existingConfig ?? {}),
		projectName,
	};

	// Explicitly apply advancedConfig overrides if provided
	if (advancedConfig.autoCommit !== undefined) config.autoCommit = advancedConfig.autoCommit;
	if (advancedConfig.remoteOperations !== undefined) config.remoteOperations = advancedConfig.remoteOperations;
	if (advancedConfig.bypassGitHooks !== undefined) config.bypassGitHooks = advancedConfig.bypassGitHooks;
	if (advancedConfig.checkActiveBranches !== undefined) config.checkActiveBranches = advancedConfig.checkActiveBranches;
	if (advancedConfig.activeBranchDays !== undefined) config.activeBranchDays = advancedConfig.activeBranchDays;
	if (advancedConfig.defaultPort !== undefined) config.defaultPort = advancedConfig.defaultPort;
	if (advancedConfig.autoOpenBrowser !== undefined) config.autoOpenBrowser = advancedConfig.autoOpenBrowser;

	if (hasDefaultEditorOverride && advancedConfig.defaultEditor) {
		config.defaultEditor = advancedConfig.defaultEditor;
	}
	if (hasZeroPaddedIdsOverride && typeof advancedConfig.zeroPaddedIds === "number" && advancedConfig.zeroPaddedIds > 0) {
		config.zeroPaddedIds = advancedConfig.zeroPaddedIds;
	}
	if (hasDefinitionOfDoneOverride && Array.isArray(advancedConfig.definitionOfDone)) {
		config.definitionOfDone = [...advancedConfig.definitionOfDone];
	}

	// Preserve all non-init-managed fields, but allow init-managed optional fields to be explicitly cleared.
	if (hasDefaultEditorOverride && !advancedConfig.defaultEditor) {
		delete config.defaultEditor;
	}
	if (
		hasZeroPaddedIdsOverride &&
		!(typeof advancedConfig.zeroPaddedIds === "number" && advancedConfig.zeroPaddedIds > 0)
	) {
		delete config.zeroPaddedIds;
	}
	if (hasDefinitionOfDoneOverride && !Array.isArray(advancedConfig.definitionOfDone)) {
		delete config.definitionOfDone;
	}

	// Create structure and save config
	if (isReInitialization) {
		await core.filesystem.saveConfig(config);
	} else {
		await core.filesystem.ensureRoadmapStructure();
		await core.filesystem.saveConfig(config);
		await core.ensureConfigLoaded();

		// Generate DNA.md (Vision & Principles)
		const dnaContent = `# DNA: ${projectName}

## Vision
${description || "A new project managed with Roadmap.md."}

## Principles
- **Seed-to-Vision**: Every task moves us from the initial seed to the final goal.
- **Evidence-Based**: Mark states reached only with technical proof or terminal output.
- **Autonomous Discovery**: Agents are encouraged to refine the DAG as they discover more.
`;
		await Bun.write(join(projectRoot, "roadmap", "DNA.md"), dnaContent);
	}

	const initialStates: { id: string; title: string }[] = [];

	// Create initial DAG based on blueprint or single baseline if description provided
	if (!isReInitialization && (blueprintType || description)) {
		const statePrefix = config.prefixes?.state || "state";
		const blueprint = blueprintType ? BLUEPRINTS[blueprintType] : undefined;

		if (blueprint) {
			// Map blueprint local IDs to canonical roadmap IDs
			const idMap = new Map<string, string>();
			for (const bs of blueprint.states) {
				const canonicalId = config.zeroPaddedIds
					? `${statePrefix}-${bs.id.padStart(config.zeroPaddedIds, "0")}`
					: `${statePrefix}-${bs.id}`;
				idMap.set(bs.id, canonicalId);
			}

			// Create states
			for (const bs of blueprint.states) {
				const canonicalId = idMap.get(bs.id)!;
				const dependsOn = (bs.dependsOnIds ?? []).map((id) => idMap.get(id)).filter(Boolean) as string[];

				let finalDescription = bs.description;

				// Inject user description into initial and final states
				if (description) {
					if (bs.isVision) {
						finalDescription = `${bs.description}\n\n## Target Goal\n${description}`;
					} else if (bs.isInitial) {
						finalDescription = `${bs.description}\n\n## Seed Inspiration\n${description}`;
					}
				}

				await core.createState({
					id: canonicalId,
					title: bs.title,
					description: finalDescription,
					status: config.defaultStatus || "To Do",
					assignee: bs.assignee ?? [],
					labels: bs.labels ?? [],
					createdDate: new Date().toISOString().slice(0, 10),
					rawContent: "",
					dependencies: dependsOn,
					requires: bs.requires ?? [],
				}, false);
				initialStates.push({ id: canonicalId, title: bs.title });
			}

			// Generate MAP.md (Visual representation)
			let mapContent = `# MAP: ${projectName} Evolution\n\n## Project Graph\n\`\`\`text\n`;
			for (const bs of blueprint.states) {
				const canonicalId = idMap.get(bs.id)!;
				const indent = "  ".repeat(Math.max(0, bs.dependsOnIds?.length ?? 0));
				mapContent += `${indent}+-- [${canonicalId}] ${bs.title}\n`;
			}
			mapContent += "```\n";
			await Bun.write(join(projectRoot, "roadmap", "MAP.md"), mapContent);
		} else if (description) {
			// Single baseline fallback
			const id = config.zeroPaddedIds ? `${statePrefix}-${"0".repeat(config.zeroPaddedIds - 1)}0` : `${statePrefix}-0`;
			await core.createState({
				id,
				title: "Project Baseline & Requirements",
				description,
				status: config.defaultStatus || "To Do",
				assignee: [],
				labels: ["baseline"],
				createdDate: new Date().toISOString().slice(0, 10),
				rawContent: "",
				dependencies: [],
			}, false);
			initialStates.push({ id, title: "Project Baseline & Requirements" });
		}
	}

	const mcpResults: Record<string, string> = {};

	// Handle MCP integration
	if (integrationMode === "mcp" && mcpClients.length > 0) {
		for (const client of mcpClients) {
			try {
				const result = await runMcpClientCommand(client, client, [
					"mcp",
					"add",
					MCP_SERVER_NAME,
					"roadmap",
					"mcp",
					"start",
				]);
				mcpResults[client] = result;
				await ensureMcpGuidelines(projectRoot, client);
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				mcpResults[client] = `Failed: ${message}`;
			}
		}
	}

	// Handle CLI integration
	if (integrationMode === "cli" && agentInstructions.length > 0) {
		await addAgentInstructions(projectRoot, agentInstructions);
	}

	// Install Claude Agent if requested
	if (installClaudeAgentFlag) {
		try {
			await installClaudeAgent(projectRoot);
			mcpResults.claudeAgent = "Successfully installed Claude Code agent";
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			mcpResults.claudeAgent = `Failed: ${message}`;
		}
	}

	return {
		success: true,
		projectName,
		description,
		isReInitialization,
		config,
		initialStates,
		mcpResults: Object.keys(mcpResults).length > 0 ? mcpResults : undefined,
	};
}
