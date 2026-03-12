/**
 * Cross-branch state state resolution
 * Determines the latest state of states across all git branches
 */

import { DEFAULT_DIRECTORIES } from "../constants/index.ts";
import type { FileSystem } from "../file-system/operations.ts";
import type { GitOperations as GitOps } from "../git/operations.ts";
import type { State } from "../types/index.ts";
import { buildPathIdRegex, normalizeId } from "../utils/prefix-config.ts";

/** Default prefix for states */
const DEFAULT_STATE_PREFIX = "state";

export type StateDirectoryType = "state" | "draft" | "archived" | "completed";

export interface StateDirectoryInfo {
	stateId: string;
	type: StateDirectoryType;
	lastModified: Date;
	branch: string;
	path: string;
}

/**
 * Get the latest directory location of specific state IDs across all branches
 * Only checks the provided state IDs for optimal performance
 */
export async function getLatestStateStatesForIds(
	gitOps: GitOps,
	_filesystem: FileSystem,
	stateIds: string[],
	onProgress?: (message: string) => void,
	options?: { recentBranchesOnly?: boolean; daysAgo?: number; prefix?: string },
): Promise<Map<string, StateDirectoryInfo>> {
	const prefix = options?.prefix ?? DEFAULT_STATE_PREFIX;
	const idRegex = buildPathIdRegex(prefix);
	const stateDirectories = new Map<string, StateDirectoryInfo>();

	if (stateIds.length === 0) {
		return stateDirectories;
	}

	try {
		// Get branches - use recent branches by default for performance
		const useRecentOnly = options?.recentBranchesOnly ?? true;
		const daysAgo = options?.daysAgo ?? 30; // Default to 30 days if not specified

		let branches = useRecentOnly ? await gitOps.listRecentBranches(daysAgo) : await gitOps.listAllBranches();

		if (branches.length === 0) {
			return stateDirectories;
		}

		// Use standard roadmap directory
		const roadmapDir = DEFAULT_DIRECTORIES.ROADMAP;

		// Filter branches that actually have roadmap changes
		const branchesWithRoadmap: string[] = [];

		// Quick check which branches actually have the roadmap directory
		for (const branch of branches) {
			try {
				// Just check if the roadmap directory exists
				const files = await gitOps.listFilesInTree(branch, roadmapDir);
				if (files.length > 0) {
					branchesWithRoadmap.push(branch);
				}
			} catch {
				// Branch doesn't have roadmap directory
			}
		}

		// Use filtered branches
		branches = branchesWithRoadmap;

		// Count local vs remote branches for info
		const localBranches = branches.filter((b) => !b.includes("origin/"));
		const remoteBranches = branches.filter((b) => b.includes("origin/"));

		const branchMsg = useRecentOnly
			? `${branches.length} branches with roadmap (from ${daysAgo} days, ${localBranches.length} local, ${remoteBranches.length} remote)`
			: `${branches.length} branches with roadmap (${localBranches.length} local, ${remoteBranches.length} remote)`;
		onProgress?.(`Checking ${stateIds.length} states across ${branchMsg}...`);

		// Create all file path combinations we need to check
		const directoryChecks: Array<{ path: string; type: StateDirectoryType }> = [
			{ path: `${roadmapDir}/states`, type: "state" },
			{ path: `${roadmapDir}/drafts`, type: "draft" },
			{ path: `${roadmapDir}/archive/states`, type: "archived" },
			{ path: `${roadmapDir}/completed`, type: "completed" },
		];

		// For better performance, prioritize checking current branch and main branch first
		const priorityBranches = ["main", "master"];
		const currentBranch = await gitOps.getCurrentBranch();
		if (currentBranch && !priorityBranches.includes(currentBranch)) {
			priorityBranches.unshift(currentBranch);
		}

		// Check priority branches first
		for (const branch of priorityBranches) {
			if (!branches.includes(branch)) continue;

			// Remove from main list to avoid duplicate checking
			branches = branches.filter((b) => b !== branch);

			// Quick check for all states in this branch
			for (const { path, type } of directoryChecks) {
				try {
					const files = await gitOps.listFilesInTree(branch, path);
					if (files.length === 0) continue;

					// Get all modification times in one pass
					const modTimes = await gitOps.getBranchLastModifiedMap(branch, path);

					// Build file->id map for O(1) lookup
					const fileToId = new Map<string, string>();
					for (const f of files) {
						const filename = f.substring(f.lastIndexOf("/") + 1);
						const match = filename.match(idRegex);
						if (match?.[1]) {
							// Normalize the ID to canonical form for lookup
							const normalizedFileId = normalizeId(match[1], prefix);
							fileToId.set(normalizedFileId, f);
						}
					}

					// Check each state ID (normalize for lookup)
					for (const stateId of stateIds) {
						const normalizedStateId = normalizeId(stateId, prefix);
						const stateFile = fileToId.get(normalizedStateId);

						if (stateFile) {
							const lastModified = modTimes.get(stateFile);
							if (lastModified) {
								const existing = stateDirectories.get(stateId);
								if (!existing || lastModified > existing.lastModified) {
									stateDirectories.set(stateId, {
										stateId,
										type,
										lastModified,
										branch,
										path: stateFile,
									});
								}
							}
						}
					}
				} catch {
					// Skip directories that don't exist
				}
			}
		}

		// If we found all states in priority branches, we can skip other branches
		if (stateDirectories.size === stateIds.length) {
			onProgress?.(`Found all ${stateIds.length} states in priority branches`);
			return stateDirectories;
		}

		// For remaining states, check other branches
		const remainingStateIds = stateIds.filter((id) => !stateDirectories.has(id));
		if (remainingStateIds.length === 0 || branches.length === 0) {
			onProgress?.(`Checked ${stateIds.length} states`);
			return stateDirectories;
		}

		onProgress?.(`Checking ${remainingStateIds.length} remaining states across ${branches.length} branches...`);

		// Check remaining branches in parallel batches
		const BRANCH_BATCH_SIZE = 5; // Process 5 branches at a time for better performance
		for (let i = 0; i < branches.length; i += BRANCH_BATCH_SIZE) {
			const branchBatch = branches.slice(i, i + BRANCH_BATCH_SIZE);

			await Promise.all(
				branchBatch.map(async (branch) => {
					for (const { path, type } of directoryChecks) {
						try {
							const files = await gitOps.listFilesInTree(branch, path);

							if (files.length === 0) continue;

							// Get all modification times in one pass
							const modTimes = await gitOps.getBranchLastModifiedMap(branch, path);

							// Build file->id map for O(1) lookup
							const fileToId = new Map<string, string>();
							for (const f of files) {
								const filename = f.substring(f.lastIndexOf("/") + 1);
								const match = filename.match(idRegex);
								if (match?.[1]) {
									// Normalize the ID to canonical form for lookup
									const normalizedFileId = normalizeId(match[1], prefix);
									fileToId.set(normalizedFileId, f);
								}
							}

							for (const stateId of remainingStateIds) {
								// Skip if we already found this state
								const normalizedStateId = normalizeId(stateId, prefix);
								if (stateDirectories.has(normalizedStateId)) continue;

								const stateFile = fileToId.get(normalizedStateId);

								if (stateFile) {
									const lastModified = modTimes.get(stateFile);
									if (lastModified) {
										const existing = stateDirectories.get(stateId);
										if (!existing || lastModified > existing.lastModified) {
											stateDirectories.set(stateId, {
												stateId,
												type,
												lastModified,
												branch,
												path: stateFile,
											});
										}
									}
								}
							}
						} catch {
							// Skip directories that don't exist
						}
					}
				}),
			);

			// Early exit if we found all states
			if (stateDirectories.size === stateIds.length) {
				break;
			}
		}

		onProgress?.(`Checked ${stateIds.length} states`);
	} catch (error) {
		console.error("Failed to get state directory locations for IDs:", error);
	}

	return stateDirectories;
}

/**
 * Filter states based on their latest directory location across all branches
 * Only returns states whose latest directory type is "state" (not draft, archived, or completed)
 */
export function filterStatesByLatestState(states: State[], latestDirectories: Map<string, StateDirectoryInfo>): State[] {
	return states.filter((state) => {
		const latestDirectory = latestDirectories.get(state.id);

		// If we don't have directory info, assume it's an active state
		if (!latestDirectory) {
			return true;
		}

		// Only show states whose latest directory type is "state"
		// Completed, archived, and draft states should not appear on the main board
		return latestDirectory.type === "state";
	});
}
