/**
 * State loading with optimized index-first, hydrate-later pattern
 * Dramatically reduces git operations for multi-branch state loading
 *
 * This is the single module for all cross-branch state loading:
 * - Local filesystem states
 * - Other local branch states
 * - Remote branch states
 */

import { DEFAULT_DIRECTORIES } from "../constants/index.ts";
import type { GitOperations } from "../git/operations.ts";
import { parseState } from "../markdown/parser.ts";
import type { RoadmapConfig, State } from "../types/index.ts";
import { buildPathIdRegex, normalizeId } from "../utils/prefix-config.ts";
import { normalizeStateId, normalizeStateIdentity } from "../utils/state-path.ts";
import type { StateDirectoryType } from "./cross-branch-states.ts";

/** Default prefix for states */
const DEFAULT_STATE_PREFIX = "state";

export interface BranchStateStateEntry {
	id: string;
	type: StateDirectoryType;
	lastModified: Date;
	branch: string;
	path: string;
}

const STATE_DIRECTORIES: Array<{ path: string; type: StateDirectoryType }> = [
	{ path: "nodes", type: "state" },
	{ path: "drafts", type: "draft" },
	{ path: "archive/states", type: "archived" },
	{ path: "completed", type: "completed" },
];

function getStateTypeFromPath(path: string, roadmapDir: string): StateDirectoryType | null {
	const normalized = path.startsWith(`${roadmapDir}/`) ? path.slice(roadmapDir.length + 1) : path;

	for (const { path: dir, type } of STATE_DIRECTORIES) {
		if (normalized.startsWith(`${dir}/`)) {
			return type;
		}
	}

	return null;
}

/**
 * Get the appropriate loading message based on remote operations configuration
 */
export function getStateLoadingMessage(config: RoadmapConfig | null): string {
	return config?.remoteOperations === false
		? "Loading states from local branches..."
		: "Loading states from local and remote branches...";
}

interface RemoteIndexEntry {
	id: string;
	branch: string;
	path: string; // "roadmap/states/state-123 - title.md"
	lastModified: Date;
}

function normalizeRemoteBranch(branch: string): string | null {
	let br = branch.trim();
	if (!br) return null;
	br = br.replace(/^refs\/remotes\//, "");
	if (br === "origin" || br === "HEAD" || br === "origin/HEAD") return null;
	if (br.startsWith("origin/")) br = br.slice("origin/".length);
	// Filter weird cases like "origin" again after stripping prefix
	if (!br || br === "HEAD" || br === "origin") return null;
	return br;
}

/**
 * Normalize a local branch name, filtering out invalid entries
 */
function normalizeLocalBranch(branch: string, currentBranch: string): string | null {
	const br = branch.trim();
	if (!br) return null;
	// Skip HEAD, origin refs, and current branch
	if (br === "HEAD" || br.includes("HEAD")) return null;
	if (br.startsWith("origin/") || br.startsWith("refs/remotes/")) return null;
	if (br === "origin") return null;
	// Skip current branch - we already have its states from filesystem
	if (br === currentBranch) return null;
	return br;
}

/**
 * Build a cheap index of remote states without fetching content
 * This is VERY fast as it only lists files and gets modification times in batch
 */
export async function buildRemoteStateIndex(
	git: GitOperations,
	branches: string[],
	roadmapDir = "roadmap",
	sinceDays?: number,
	stateCollector?: BranchStateStateEntry[],
	prefix = DEFAULT_STATE_PREFIX,
	includeCompleted = false,
): Promise<Map<string, RemoteIndexEntry[]>> {
	const out = new Map<string, RemoteIndexEntry[]>();

	const normalized = branches.map(normalizeRemoteBranch).filter((b): b is string => Boolean(b));

	// Do branches in parallel but not unbounded
	const CONCURRENCY = 4;
	const queue = [...normalized];

	const workers = Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
		while (queue.length) {
			const br = queue.pop();
			if (!br) break;

			const ref = `origin/${br}`;

			try {
				const listPath = stateCollector ? roadmapDir : `${roadmapDir}/states`;

				// Get roadmap files for this branch
				const files = await git.listFilesInTree(ref, listPath);
				if (files.length === 0) continue;

				// Get last modified times for all files in one pass
				const lm = await git.getBranchLastModifiedMap(ref, listPath, sinceDays);

				// Build regex for configured prefix (no ^ anchor for path matching)
				const idRegex = buildPathIdRegex(prefix);

				for (const f of files) {
					// Extract state ID from filename using configured prefix
					const m = f.match(idRegex);
					if (!m?.[1]) continue;

					const id = normalizeId(m[1], prefix);
					const lastModified = lm.get(f) ?? new Date(0);
					const entry: RemoteIndexEntry = { id, branch: br, path: f, lastModified };

					// Collect full state info when requested
					const type = getStateTypeFromPath(f, roadmapDir);
					if (!stateCollector && type !== "state") {
						continue;
					}
					if (type && stateCollector) {
						stateCollector.push({
							id,
							type,
							branch: br,
							path: f,
							lastModified,
						});
					}

					// Only index active states for hydration selection (optionally include completed)
					if (type === "state" || (includeCompleted && type === "completed")) {
						const arr = out.get(id);
						if (arr) {
							arr.push(entry);
						} else {
							out.set(id, [entry]);
						}
					}
				}
			} catch (error) {
				// Branch might not have roadmap directory, skip it
				console.debug(`Skipping branch ${br}: ${error}`);
			}
		}
	});

	await Promise.all(workers);
	return out;
}

/**
 * Hydrate states by fetching their content
 * Only call this for the "winner" states that we actually need
 */
async function hydrateStates(
	git: GitOperations,
	winners: Array<{ id: string; ref: string; path: string }>,
): Promise<State[]> {
	const CONCURRENCY = 8;
	const result: State[] = [];
	let i = 0;

	async function worker() {
		while (i < winners.length) {
			const idx = i++;
			if (idx >= winners.length) break;

			const w = winners[idx];
			if (!w) break;

			try {
				const content = await git.showFile(w.ref, w.path);
				const state = normalizeStateIdentity(parseState(content));
				if (state) {
					// Mark as remote source and branch
					state.source = "remote";
					// Extract branch name from ref (e.g., "origin/main" -> "main")
					state.branch = w.ref.replace("origin/", "");
					result.push(state);
				}
			} catch (error) {
				console.error(`Failed to hydrate state ${w.id} from ${w.ref}:${w.path}`, error);
			}
		}
	}

	await Promise.all(Array.from({ length: Math.min(CONCURRENCY, winners.length) }, worker));
	return result;
}

/**
 * Build a cheap index of states from local branches (excluding current branch)
 * Similar to buildRemoteStateIndex but for local refs
 */
export async function buildLocalBranchStateIndex(
	git: GitOperations,
	branches: string[],
	currentBranch: string,
	roadmapDir = "roadmap",
	sinceDays?: number,
	stateCollector?: BranchStateStateEntry[],
	prefix = DEFAULT_STATE_PREFIX,
	includeCompleted = false,
): Promise<Map<string, RemoteIndexEntry[]>> {
	const out = new Map<string, RemoteIndexEntry[]>();

	const normalized = branches.map((b) => normalizeLocalBranch(b, currentBranch)).filter((b): b is string => Boolean(b));

	if (normalized.length === 0) {
		return out;
	}

	// Do branches in parallel but not unbounded
	const CONCURRENCY = 4;
	const queue = [...normalized];

	const workers = Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
		while (queue.length) {
			const br = queue.pop();
			if (!br) break;

			try {
				const listPath = stateCollector ? roadmapDir : `${roadmapDir}/states`;

				// Get roadmap files in this branch
				const files = await git.listFilesInTree(br, listPath);
				if (files.length === 0) continue;

				// Get last modified times for all files in one pass
				const lm = await git.getBranchLastModifiedMap(br, listPath, sinceDays);

				// Build regex for configured prefix (no ^ anchor for path matching)
				const idRegex = buildPathIdRegex(prefix);

				for (const f of files) {
					// Extract state ID from filename using configured prefix
					const m = f.match(idRegex);
					if (!m?.[1]) continue;

					const id = normalizeId(m[1], prefix);
					const lastModified = lm.get(f) ?? new Date(0);
					const entry: RemoteIndexEntry = { id, branch: br, path: f, lastModified };

					// Collect full state info when requested
					const type = getStateTypeFromPath(f, roadmapDir);
					if (!stateCollector && type !== "state") {
						continue;
					}
					if (type && stateCollector) {
						stateCollector.push({
							id,
							type,
							branch: br,
							path: f,
							lastModified,
						});
					}

					// Only index active states for hydration selection (optionally include completed)
					if (type === "state" || (includeCompleted && type === "completed")) {
						const arr = out.get(id);
						if (arr) {
							arr.push(entry);
						} else {
							out.set(id, [entry]);
						}
					}
				}
			} catch (error) {
				// Branch might not have roadmap directory, skip it
				if (process.env.DEBUG) {
					console.debug(`Skipping local branch ${br}: ${error}`);
				}
			}
		}
	});

	await Promise.all(workers);
	return out;
}

/**
 * Choose which remote states need to be hydrated based on strategy
 * Returns only the states that are newer or more progressed than local versions
 */
function chooseWinners(
	localById: Map<string, State>,
	remoteIndex: Map<string, RemoteIndexEntry[]>,
	strategy: "most_recent" | "most_progressed" = "most_progressed",
): Array<{ id: string; ref: string; path: string }> {
	const winners: Array<{ id: string; ref: string; path: string }> = [];

	for (const [id, entries] of remoteIndex) {
		const local = localById.get(id);

		if (!local) {
			// No local version - take the newest remote
			const best = entries.reduce((a, b) => (a.lastModified >= b.lastModified ? a : b));
			winners.push({ id, ref: `origin/${best.branch}`, path: best.path });
			continue;
		}

		// If strategy is "most_recent", only hydrate if any remote is newer
		if (strategy === "most_recent") {
			const localTs = local.updatedDate ? new Date(local.updatedDate).getTime() : 0;
			const newestRemote = entries.reduce((a, b) => (a.lastModified >= b.lastModified ? a : b));

			if (newestRemote.lastModified.getTime() > localTs) {
				winners.push({
					id,
					ref: `origin/${newestRemote.branch}`,
					path: newestRemote.path,
				});
			}
			continue;
		}

		// For "most_progressed", we might need to check if remote is newer
		// to potentially have a more progressed status
		const localTs = local.updatedDate ? new Date(local.updatedDate).getTime() : 0;
		const maybeNewer = entries.some((e) => e.lastModified.getTime() > localTs);

		if (maybeNewer) {
			// Only hydrate the newest remote to check if it's more progressed
			const newestRemote = entries.reduce((a, b) => (a.lastModified >= b.lastModified ? a : b));
			winners.push({
				id,
				ref: `origin/${newestRemote.branch}`,
				path: newestRemote.path,
			});
		}
	}

	return winners;
}

/**
 * Find and load a specific state from remote branches
 * Searches through recent remote branches for the state and returns the newest version
 */
export async function findStateInRemoteBranches(
	git: GitOperations,
	stateId: string,
	roadmapDir = "roadmap",
	sinceDays = 30,
	prefix = DEFAULT_STATE_PREFIX,
): Promise<State | null> {
	try {
		// Check if we have any remote
		if (!(await git.hasAnyRemote())) return null;

		// Get recent remote branches
		const branches = await git.listRecentRemoteBranches(sinceDays);
		if (branches.length === 0) return null;

		// Build state index for remote branches
		const remoteIndex = await buildRemoteStateIndex(git, branches, roadmapDir, sinceDays, undefined, prefix);

		const normalizedId = normalizeId(stateId, prefix);

		// Check if the state exists in the index
		const entries = remoteIndex.get(normalizedId);
		if (!entries || entries.length === 0) return null;

		// Get the newest version
		const best = entries.reduce((a, b) => (a.lastModified >= b.lastModified ? a : b));

		// Hydrate the state
		const ref = `origin/${best.branch}`;
		const content = await git.showFile(ref, best.path);
		const state = normalizeStateIdentity(parseState(content));
		if (state) {
			state.source = "remote";
			state.branch = best.branch;
		}
		return state;
	} catch (error) {
		if (process.env.DEBUG) {
			console.error(`Failed to find state ${stateId} in remote branches:`, error);
		}
		return null;
	}
}

/**
 * Find and load a specific state from local branches (excluding current branch)
 * Searches through recent local branches for the state and returns the newest version
 */
export async function findStateInLocalBranches(
	git: GitOperations,
	stateId: string,
	roadmapDir = "roadmap",
	sinceDays = 30,
	prefix = DEFAULT_STATE_PREFIX,
): Promise<State | null> {
	try {
		const currentBranch = await git.getCurrentBranch();
		if (!currentBranch) return null;

		// Get recent local branches
		const allBranches = await git.listRecentBranches(sinceDays);
		const localBranches = allBranches.filter(
			(b) => !b.startsWith("origin/") && !b.startsWith("refs/remotes/") && b !== "origin",
		);

		if (localBranches.length <= 1) return null; // Only current branch

		// Build state index for local branches
		const localIndex = await buildLocalBranchStateIndex(
			git,
			localBranches,
			currentBranch,
			roadmapDir,
			sinceDays,
			undefined,
			prefix,
		);

		const normalizedId = normalizeId(stateId, prefix);

		// Check if the state exists in the index
		const entries = localIndex.get(normalizedId);
		if (!entries || entries.length === 0) return null;

		// Get the newest version
		const best = entries.reduce((a, b) => (a.lastModified >= b.lastModified ? a : b));

		// Hydrate the state
		const content = await git.showFile(best.branch, best.path);
		const state = normalizeStateIdentity(parseState(content));
		if (state) {
			state.source = "local-branch";
			state.branch = best.branch;
		}
		return state;
	} catch (error) {
		if (process.env.DEBUG) {
			console.error(`Failed to find state ${stateId} in local branches:`, error);
		}
		return null;
	}
}

/**
 * Load all remote states using optimized index-first, hydrate-later pattern
 * Dramatically reduces git operations by only fetching content for states that need it
 */
export async function loadRemoteStates(
	gitOps: GitOperations,
	userConfig: RoadmapConfig | null = null,
	onProgress?: (message: string) => void,
	localStates?: State[],
	stateCollector?: BranchStateStateEntry[],
	includeCompleted = false,
): Promise<State[]> {
	try {
		// Skip remote operations if disabled
		if (userConfig?.remoteOperations === false) {
			onProgress?.("Remote operations disabled - skipping remote states");
			return [];
		}

		// Fetch remote branches
		onProgress?.("Fetching remote branches...");
		await gitOps.fetch();

		// Use recent branches only for better performance
		const days = userConfig?.activeBranchDays ?? 30;
		const branches = await gitOps.listRecentRemoteBranches(days);

		if (branches.length === 0) {
			onProgress?.("No recent remote branches found");
			return [];
		}

		onProgress?.(`Indexing ${branches.length} recent remote branches (last ${days} days)...`);

		// Build a cheap index without fetching content
		const roadmapDir = DEFAULT_DIRECTORIES.ROADMAP;
		const statePrefix = userConfig?.prefixes?.state ?? DEFAULT_STATE_PREFIX;
		const remoteIndex = await buildRemoteStateIndex(
			gitOps,
			branches,
			roadmapDir,
			days,
			stateCollector,
			statePrefix,
			includeCompleted,
		);

		if (remoteIndex.size === 0) {
			onProgress?.("No remote states found");
			return [];
		}

		onProgress?.(`Found ${remoteIndex.size} unique states across remote branches`);

		// If we have local states, use them to determine which remote states to hydrate
		let winners: Array<{ id: string; ref: string; path: string }>;

		if (localStates && localStates.length > 0) {
			const localById = new Map(localStates.map((t) => [normalizeStateId(t.id), t]));
			const strategy = userConfig?.stateResolutionStrategy || "most_progressed";

			// Only hydrate remote states that are newer or missing locally
			winners = chooseWinners(localById, remoteIndex, strategy);
			onProgress?.(`Hydrating ${winners.length} remote candidates...`);
		} else {
			// No local states, need to hydrate all remote states (take newest of each)
			winners = [];
			for (const [id, entries] of remoteIndex) {
				const best = entries.reduce((a, b) => (a.lastModified >= b.lastModified ? a : b));
				winners.push({ id, ref: `origin/${best.branch}`, path: best.path });
			}
			onProgress?.(`Hydrating ${winners.length} remote states...`);
		}

		// Only fetch content for the states we actually need
		const hydratedStates = await hydrateStates(gitOps, winners);

		onProgress?.(`Loaded ${hydratedStates.length} remote states`);
		return hydratedStates;
	} catch (error) {
		// If fetch fails, we can still work with local states
		console.error("Failed to fetch remote states:", error);
		return [];
	}
}

/**
 * Resolve conflicts between local and remote states based on strategy
 */
function getStateDate(state: State): Date {
	if (state.updatedDate) {
		return new Date(state.updatedDate);
	}
	return state.lastModified ?? new Date(0);
}

export function resolveStateConflict(
	existing: State,
	incoming: State,
	statuses: string[],
	strategy: "most_recent" | "most_progressed" = "most_progressed",
): State {
	if (strategy === "most_recent") {
		const existingDate = getStateDate(existing);
		const incomingDate = getStateDate(incoming);
		return existingDate >= incomingDate ? existing : incoming;
	}

	// Default to most_progressed strategy
	// Map status to rank (default to 0 for unknown statuses)
	const currentIdx = statuses.indexOf(existing.status);
	const newIdx = statuses.indexOf(incoming.status);
	const currentRank = currentIdx >= 0 ? currentIdx : 0;
	const newRank = newIdx >= 0 ? newIdx : 0;

	// If incoming state has a more progressed status, use it
	if (newRank > currentRank) {
		return incoming;
	}

	// If statuses are equal, use the most recent
	if (newRank === currentRank) {
		const existingDate = getStateDate(existing);
		const incomingDate = getStateDate(incoming);
		return existingDate >= incomingDate ? existing : incoming;
	}

	return existing;
}

/**
 * Load states from other local branches (not current branch, not remote)
 * Uses the same optimized index-first, hydrate-later pattern as remote loading
 */
export async function loadLocalBranchStates(
	gitOps: GitOperations,
	userConfig: RoadmapConfig | null = null,
	onProgress?: (message: string) => void,
	localStates?: State[],
	stateCollector?: BranchStateStateEntry[],
	includeCompleted = false,
): Promise<State[]> {
	try {
		const currentBranch = await gitOps.getCurrentBranch();
		if (!currentBranch) {
			// Not on a branch (detached HEAD), skip local branch loading
			return [];
		}

		// Get recent local branches (excludes remote refs)
		const days = userConfig?.activeBranchDays ?? 30;
		const allBranches = await gitOps.listRecentBranches(days);

		// Filter to only local branches (not origin/*)
		const localBranches = allBranches.filter(
			(b) => !b.startsWith("origin/") && !b.startsWith("refs/remotes/") && b !== "origin",
		);

		if (localBranches.length <= 1) {
			// Only current branch or no branches
			return [];
		}

		onProgress?.(`Indexing ${localBranches.length - 1} other local branches...`);

		// Build index of states from other local branches
		const roadmapDir = DEFAULT_DIRECTORIES.ROADMAP;
		const statePrefix = userConfig?.prefixes?.state ?? DEFAULT_STATE_PREFIX;
		const localBranchIndex = await buildLocalBranchStateIndex(
			gitOps,
			localBranches,
			currentBranch,
			roadmapDir,
			days,
			stateCollector,
			statePrefix,
			includeCompleted,
		);

		if (localBranchIndex.size === 0) {
			return [];
		}

		onProgress?.(`Found ${localBranchIndex.size} unique states in other local branches`);

		// Determine which states to hydrate
		let winners: Array<{ id: string; ref: string; path: string }>;

		if (localStates && localStates.length > 0) {
			const localById = new Map(localStates.map((t) => [normalizeStateId(t.id), t]));
			const strategy = userConfig?.stateResolutionStrategy || "most_progressed";

			// Only hydrate states that are missing locally or potentially newer
			winners = [];
			for (const [id, entries] of localBranchIndex) {
				const local = localById.get(id);

				if (!local) {
					// State doesn't exist locally - take the newest from other branches
					const best = entries.reduce((a, b) => (a.lastModified >= b.lastModified ? a : b));
					winners.push({ id, ref: best.branch, path: best.path });
					continue;
				}

				// For existing states, check if any other branch version is newer
				if (strategy === "most_recent") {
					const localTs = local.updatedDate ? new Date(local.updatedDate).getTime() : 0;
					const newestOther = entries.reduce((a, b) => (a.lastModified >= b.lastModified ? a : b));

					if (newestOther.lastModified.getTime() > localTs) {
						winners.push({ id, ref: newestOther.branch, path: newestOther.path });
					}
				} else {
					// For most_progressed, we need to hydrate to check status
					const localTs = local.updatedDate ? new Date(local.updatedDate).getTime() : 0;
					const maybeNewer = entries.some((e) => e.lastModified.getTime() > localTs);

					if (maybeNewer) {
						const newestOther = entries.reduce((a, b) => (a.lastModified >= b.lastModified ? a : b));
						winners.push({ id, ref: newestOther.branch, path: newestOther.path });
					}
				}
			}
		} else {
			// No local states, hydrate all from other branches (take newest of each)
			winners = [];
			for (const [id, entries] of localBranchIndex) {
				const best = entries.reduce((a, b) => (a.lastModified >= b.lastModified ? a : b));
				winners.push({ id, ref: best.branch, path: best.path });
			}
		}

		if (winners.length === 0) {
			return [];
		}

		onProgress?.(`Hydrating ${winners.length} states from other local branches...`);

		// Hydrate the states - note: ref is the branch name directly (not origin/)
		const hydratedStates = await hydrateStates(gitOps, winners);

		// Mark these as coming from local branches
		for (const state of hydratedStates) {
			state.source = "local-branch";
		}

		onProgress?.(`Loaded ${hydratedStates.length} states from other local branches`);
		return hydratedStates;
	} catch (error) {
		if (process.env.DEBUG) {
			console.error("Failed to load local branch states:", error);
		}
		return [];
	}
}
