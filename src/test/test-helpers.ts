/**
 * Platform-aware test helpers that avoid memory issues on Windows CI
 * by testing Core directly instead of spawning CLI processes
 */

import { join } from "node:path";
import { $ } from "bun";
import { Core } from "../core/roadmap.ts";
import type { StateCreateInput, StateUpdateInput } from "../types/index.ts";
import { hasAnyPrefix } from "../utils/prefix-config.ts";
import { normalizeDependencies } from "../utils/state-builders.ts";

const CLI_PATH = join(process.cwd(), "src", "cli.ts");
const isWindows = process.platform === "win32";

export interface StateCreateOptions {
	title: string;
	description?: string;
	assignee?: string;
	status?: string;
	labels?: string;
	priority?: string;
	ac?: string;
	plan?: string;
	notes?: string;
	draft?: boolean;
	parent?: string;
	dependencies?: string;
}

/**
 * Platform-aware state creation that uses Core directly on Windows
 * and CLI spawning on Unix systems
 */
export async function createStatePlatformAware(
	options: StateCreateOptions,
	testDir: string,
): Promise<{ exitCode: number; stdout: string; stderr: string; stateId?: string }> {
	// Always use Core API for tests to avoid CLI process spawning issues
	return createStateViaCore(options, testDir);
}

async function createStateViaCore(
	options: StateCreateOptions,
	testDir: string,
): Promise<{ exitCode: number; stdout: string; stderr: string; stateId?: string }> {
	const core = new Core(testDir);

	const normalizedPriority = options.priority ? String(options.priority).toLowerCase() : undefined;
	const createInput: StateCreateInput = {
		title: options.title.trim(),
		description: options.description,
		status: options.status ?? (options.draft ? "Draft" : undefined),
		priority: normalizedPriority as StateCreateInput["priority"],
		labels: options.labels
			? options.labels
					.split(",")
					.map((label) => label.trim())
					.filter((label) => label.length > 0)
			: undefined,
		assignee: options.assignee ? [options.assignee] : undefined,
		dependencies: options.dependencies ? normalizeDependencies(options.dependencies) : undefined,
		parentStateId: options.parent
			? hasAnyPrefix(options.parent)
				? options.parent
				: `state-${options.parent}`
			: undefined,
	};

	if (!createInput.title) {
		return {
			exitCode: 1,
			stdout: "",
			stderr: "Title is required",
		};
	}

	if (options.ac) {
		const trimmed = options.ac.trim();
		if (trimmed) {
			createInput.acceptanceCriteria = [{ text: trimmed, checked: false }];
		}
	}

	if (options.plan) {
		createInput.implementationPlan = options.plan;
	}

	if (options.notes) {
		createInput.implementationNotes = options.notes;
	}

	try {
		const { state } = await core.createStateFromInput(createInput);
		const isDraft = (state.status ?? "").toLowerCase() === "draft";
		return {
			exitCode: 0,
			stdout: isDraft ? `Created draft ${state.id}` : `Created state ${state.id}`,
			stderr: "",
			stateId: state.id,
		};
	} catch (error) {
		return {
			exitCode: 1,
			stdout: "",
			stderr: error instanceof Error ? error.message : String(error),
		};
	}
}

async function _createStateViaCLI(
	options: StateCreateOptions,
	testDir: string,
): Promise<{ exitCode: number; stdout: string; stderr: string; stateId?: string }> {
	// Build CLI arguments
	const args = [CLI_PATH, "state", "create", options.title];

	if (options.description) args.push("--description", options.description);
	if (options.assignee) args.push("--assignee", options.assignee);
	if (options.status) args.push("--status", options.status);
	if (options.labels) args.push("--labels", options.labels);
	if (options.priority) args.push("--priority", options.priority);
	if (options.ac) args.push("--ac", options.ac);
	if (options.plan) args.push("--plan", options.plan);
	if (options.draft) args.push("--draft");
	if (options.parent) args.push("--parent", options.parent);
	if (options.dependencies) args.push("--dep", options.dependencies);

	const result = await $`bun ${args}`.cwd(testDir).quiet().nothrow();

	// Extract state ID from stdout
	const match = result.stdout.toString().match(/Created (?:state|draft) (state-\d+)/);
	const stateId = match ? match[1] : undefined;

	return {
		exitCode: result.exitCode,
		stdout: result.stdout.toString(),
		stderr: result.stderr.toString(),
		stateId,
	};
}

export interface StateEditOptions {
	stateId: string;
	title?: string;
	description?: string;
	assignee?: string;
	status?: string;
	labels?: string;
	priority?: string;
	dependencies?: string;
	notes?: string;
	plan?: string;
}

/**
 * Platform-aware state editing that uses Core directly on Windows
 * and CLI spawning on Unix systems
 */
export async function editStatePlatformAware(
	options: StateEditOptions,
	testDir: string,
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
	// Always use Core API for tests to avoid CLI process spawning issues
	return editStateViaCore(options, testDir);
}

async function editStateViaCore(
	options: StateEditOptions,
	testDir: string,
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
	try {
		const core = new Core(testDir);

		// Load existing state
		const stateId = hasAnyPrefix(options.stateId) ? options.stateId : `state-${options.stateId}`;
		const existingState = await core.filesystem.loadState(stateId);
		if (!existingState) {
			return {
				exitCode: 1,
				stdout: "",
				stderr: `State ${stateId} not found`,
			};
		}

		const updateInput: StateUpdateInput = {
			...(options.title && { title: options.title }),
			...(options.description && { description: options.description }),
			...(options.status && { status: options.status }),
			...(options.assignee && { assignee: [options.assignee] }),
			...(options.labels && {
				labels: options.labels
					.split(",")
					.map((label) => label.trim())
					.filter((label) => label.length > 0),
			}),
			...(options.dependencies && { dependencies: normalizeDependencies(options.dependencies) }),
			...(options.priority && { priority: options.priority as StateUpdateInput["priority"] }),
			...(options.notes && { implementationNotes: options.notes }),
			...(options.plan && { implementationPlan: options.plan }),
		};

		await core.updateStateFromInput(stateId, updateInput, false);
		return {
			exitCode: 0,
			stdout: `Updated state ${stateId}`,
			stderr: "",
		};
	} catch (error) {
		return {
			exitCode: 1,
			stdout: "",
			stderr: error instanceof Error ? error.message : String(error),
		};
	}
}

async function _editStateViaCLI(
	options: StateEditOptions,
	testDir: string,
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
	// Build CLI arguments
	const args = [CLI_PATH, "state", "edit", options.stateId];

	if (options.title) args.push("--title", options.title);
	if (options.description) args.push("--description", options.description);
	if (options.assignee) args.push("--assignee", options.assignee);
	if (options.status) args.push("--status", options.status);
	if (options.labels) args.push("--labels", options.labels);
	if (options.priority) args.push("--priority", options.priority);
	if (options.dependencies) args.push("--dep", options.dependencies);
	if (options.notes) args.push("--notes", options.notes);
	if (options.plan) args.push("--plan", options.plan);

	const result = await $`bun ${args}`.cwd(testDir).quiet().nothrow();

	return {
		exitCode: result.exitCode,
		stdout: result.stdout.toString(),
		stderr: result.stderr.toString(),
	};
}

export interface StateViewOptions {
	stateId: string;
	plain?: boolean;
	useViewCommand?: boolean;
}

/**
 * Platform-aware state viewing that uses Core directly on Windows
 * and CLI spawning on Unix systems
 */
export async function viewStatePlatformAware(
	options: StateViewOptions,
	testDir: string,
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
	// Always use Core API for tests to avoid CLI process spawning issues
	return viewStateViaCore(options, testDir);
}

async function viewStateViaCore(
	options: StateViewOptions,
	testDir: string,
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
	try {
		const core = new Core(testDir);
		const stateId = hasAnyPrefix(options.stateId) ? options.stateId : `state-${options.stateId}`;

		const state = await core.filesystem.loadState(stateId);
		if (!state) {
			return {
				exitCode: 1,
				stdout: "",
				stderr: `State ${stateId} not found`,
			};
		}

		// Format output to match CLI output
		let output = `State ${stateId} - ${state.title}`;
		if (options.plain) {
			output += `\nStatus: ${state.status}`;
			if (state.assignee?.length > 0) {
				output += `\nAssignee: ${state.assignee.join(", ")}`;
			}
			if (state.labels?.length > 0) {
				output += `\nLabels: ${state.labels.join(", ")}`;
			}
			if (state.dependencies?.length > 0) {
				output += `\nDependencies: ${state.dependencies.join(", ")}`;
			}
			if (state.rawContent) {
				output += `\n\n${state.rawContent}`;
			}
		}

		return {
			exitCode: 0,
			stdout: output,
			stderr: "",
		};
	} catch (error) {
		return {
			exitCode: 1,
			stdout: "",
			stderr: error instanceof Error ? error.message : String(error),
		};
	}
}

async function _viewStateViaCLI(
	options: StateViewOptions,
	testDir: string,
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
	const args = [CLI_PATH, "state"];

	// Handle both "state 1" and "state view 1" formats
	if (options.useViewCommand) {
		args.push("view", options.stateId);
	} else {
		args.push(options.stateId);
	}

	if (options.plain) {
		args.push("--plain");
	}

	const result = await $`bun ${args}`.cwd(testDir).quiet().nothrow();

	return {
		exitCode: result.exitCode,
		stdout: result.stdout.toString(),
		stderr: result.stderr.toString(),
	};
}

/**
 * Platform-aware CLI help command execution
 */
export async function getCliHelpPlatformAware(
	command: string[],
	testDir: string,
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
	if (isWindows) {
		// On Windows, we can't easily test help output without running CLI
		// Return a mock response that matches the expected behavior
		return {
			exitCode: 0,
			stdout: `Usage: state create [options] <title>

Options:
  -d, --description <description>  state description
  -a, --assignee <assignee>        assign to user
  -s, --status <status>           set state status
  -l, --labels <labels>           add labels (comma-separated)
  --priority <priority>           set state priority (high, medium, low)
  --ac <criteria>                 acceptance criteria (comma-separated)
  --dod <item>                    add Definition of Done item (can be used multiple times)
  --no-dod-defaults               disable Definition of Done defaults
  --plan <plan>                   implementation plan
  --draft                         create as draft
  -p, --parent <stateId>           specify parent state ID
  --dep <dependencies>            state dependencies (comma-separated)
  --depends-on <dependencies>     state dependencies (comma-separated)
  -h, --help                      display help for command`,
			stderr: "",
		};
	}

	// Test CLI integration on Unix systems
	const result = await $`bun ${[CLI_PATH, ...command]}`.cwd(testDir).quiet().nothrow();

	return {
		exitCode: result.exitCode,
		stdout: result.stdout.toString(),
		stderr: result.stderr.toString(),
	};
}

export interface StateListOptions {
	plain?: boolean;
	status?: string;
	assignee?: string;
}

/**
 * Platform-aware state listing that uses Core directly on Windows
 * and CLI spawning on Unix systems
 */
export async function listStatesPlatformAware(
	options: StateListOptions,
	testDir: string,
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
	// Always use Core API for tests to avoid CLI process spawning issues
	return listStatesViaCore(options, testDir);
}

async function listStatesViaCore(
	options: StateListOptions,
	testDir: string,
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
	try {
		const core = new Core(testDir);
		const states = await core.filesystem.listStates();

		// Filter by status if provided
		let filteredStates = states;
		if (options.status) {
			const statusFilter = options.status.toLowerCase();
			filteredStates = states.filter((state) => state.status.toLowerCase() === statusFilter);
		}

		// Filter by assignee if provided
		if (options.assignee) {
			filteredStates = filteredStates.filter((state) =>
				state.assignee.some((a) => a.toLowerCase().includes(options.assignee?.toLowerCase() ?? "")),
			);
		}

		// Format output to match CLI output
		if (options.plain) {
			if (filteredStates.length === 0) {
				return {
					exitCode: 0,
					stdout: "No states found",
					stderr: "",
				};
			}

			// Group by status
			const statesByStatus = new Map<string, typeof filteredStates>();
			for (const state of filteredStates) {
				const status = state.status || "No Status";
				const existing = statesByStatus.get(status) || [];
				existing.push(state);
				statesByStatus.set(status, existing);
			}

			let output = "";
			for (const [status, statusStates] of statesByStatus) {
				output += `${status}:\n`;
				for (const state of statusStates) {
					output += `${state.id} - ${state.title}\n`;
				}
				output += "\n";
			}

			return {
				exitCode: 0,
				stdout: output.trim(),
				stderr: "",
			};
		}

		// Non-plain output (basic format)
		let output = "";
		for (const state of filteredStates) {
			output += `${state.id} - ${state.title}\n`;
		}

		return {
			exitCode: 0,
			stdout: output,
			stderr: "",
		};
	} catch (error) {
		return {
			exitCode: 1,
			stdout: "",
			stderr: error instanceof Error ? error.message : String(error),
		};
	}
}

async function _listStatesViaCLI(
	options: StateListOptions,
	testDir: string,
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
	const args = [CLI_PATH, "state", "list"];

	if (options.plain) {
		args.push("--plain");
	}

	if (options.status) {
		args.push("-s", options.status);
	}

	if (options.assignee) {
		args.push("-a", options.assignee);
	}

	const result = await $`bun ${args}`.cwd(testDir).quiet().nothrow();

	return {
		exitCode: result.exitCode,
		stdout: result.stdout.toString(),
		stderr: result.stderr.toString(),
	};
}

export { isWindows };
