import { Core } from "../index.ts";
import type { RoadmapConfig } from "../types/index.ts";

type CoreCallback<T> = (core: Core) => Promise<T>;

/**
 * Create a Core instance bound to the current working directory.
 */
function createCore(): Core {
	return new Core(process.cwd());
}

/**
 * Execute a callback with a Core instance, returning a fallback value if anything fails.
 */
async function withCore<T>(callback: CoreCallback<T>, fallback: T): Promise<T> {
	try {
		const core = createCore();
		return await callback(core);
	} catch {
		return fallback;
	}
}

function getDefaultStatuses(): string[] {
	return ["To Do", "In Progress", "Done"];
}

/**
 * Get all state IDs from the roadmap
 */
export async function getStateIds(): Promise<string[]> {
	return await withCore(async (core) => {
		const states = await core.filesystem.listStates();
		return states.map((state) => state.id).sort();
	}, []);
}

/**
 * Get configured status values
 */
export async function getStatuses(): Promise<string[]> {
	return await withCore(async (core) => {
		const config: RoadmapConfig | null = await core.filesystem.loadConfig();
		const statuses = config?.statuses;
		if (Array.isArray(statuses) && statuses.length > 0) {
			return statuses;
		}
		return getDefaultStatuses();
	}, getDefaultStatuses());
}

/**
 * Get priority values
 */
export function getPriorities(): string[] {
	return ["high", "medium", "low"];
}

/**
 * Get unique labels from all states
 */
export async function getLabels(): Promise<string[]> {
	return await withCore(async (core) => {
		const states = await core.filesystem.listStates();
		const labels = new Set<string>();
		for (const state of states) {
			for (const label of state.labels) {
				labels.add(label);
			}
		}
		return Array.from(labels).sort();
	}, []);
}

/**
 * Get unique assignees from all states
 */
export async function getAssignees(): Promise<string[]> {
	return await withCore(async (core) => {
		const states = await core.filesystem.listStates();
		const assignees = new Set<string>();
		for (const state of states) {
			for (const assignee of state.assignee) {
				assignees.add(assignee);
			}
		}
		return Array.from(assignees).sort();
	}, []);
}

/**
 * Get all document IDs from the roadmap
 */
export async function getDocumentIds(): Promise<string[]> {
	return await withCore(async (core) => {
		const docs = await core.filesystem.listDocuments();
		return docs.map((doc) => doc.id).sort();
	}, []);
}
