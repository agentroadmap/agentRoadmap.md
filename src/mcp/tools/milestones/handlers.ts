import { rename as moveFile } from "node:fs/promises";
import type { Milestone, State } from "../../../types/index.ts";
import { McpError } from "../../errors/mcp-errors.ts";
import type { McpServer } from "../../server.ts";
import type { CallToolResult } from "../../types.ts";
import {
	buildMilestoneMatchKeys,
	keySetsIntersect,
	milestoneKey,
	normalizeMilestoneName,
	resolveMilestoneStorageValue,
} from "../../utils/milestone-resolution.ts";

export type MilestoneAddArgs = {
	name: string;
	description?: string;
};

export type MilestoneRenameArgs = {
	from: string;
	to: string;
	updateStates?: boolean;
};

export type MilestoneRemoveArgs = {
	name: string;
	stateHandling?: "clear" | "keep" | "reassign";
	reassignTo?: string;
};

export type MilestoneArchiveArgs = {
	name: string;
};

function collectArchivedMilestoneKeys(archivedMilestones: Milestone[], activeMilestones: Milestone[]): string[] {
	const keys = new Set<string>();
	const activeTitleKeys = new Set(activeMilestones.map((milestone) => milestoneKey(milestone.title)).filter(Boolean));

	for (const milestone of archivedMilestones) {
		const idKey = milestoneKey(milestone.id);
		if (idKey) {
			keys.add(idKey);
		}
		const titleKey = milestoneKey(milestone.title);
		if (titleKey && !activeTitleKeys.has(titleKey)) {
			keys.add(titleKey);
		}
	}

	return Array.from(keys);
}

function formatListBlock(title: string, items: string[]): string {
	if (items.length === 0) {
		return `${title}\n  (none)`;
	}
	return `${title}\n${items.map((item) => `  - ${item}`).join("\n")}`;
}

function formatStateIdList(stateIds: string[], limit = 20): string {
	if (stateIds.length === 0) return "";
	const shown = stateIds.slice(0, limit);
	const suffix = stateIds.length > limit ? ` (and ${stateIds.length - limit} more)` : "";
	return `${shown.join(", ")}${suffix}`;
}

function findActiveMilestoneByAlias(name: string, milestones: Milestone[]): Milestone | undefined {
	const normalized = normalizeMilestoneName(name);
	const key = milestoneKey(normalized);
	if (!key) {
		return undefined;
	}
	const resolvedId = resolveMilestoneStorageValue(normalized, milestones);
	const resolvedKey = milestoneKey(resolvedId);
	const idMatch = milestones.find((milestone) => milestoneKey(milestone.id) === resolvedKey);
	if (idMatch) {
		return idMatch;
	}
	const titleMatches = milestones.filter((milestone) => milestoneKey(milestone.title) === key);
	return titleMatches.length === 1 ? titleMatches[0] : undefined;
}

function buildStateMatchKeysForMilestone(name: string, milestone?: Milestone, includeTitleMatch = true): Set<string> {
	if (!milestone) {
		return buildMilestoneMatchKeys(name, []);
	}
	const baseValue = includeTitleMatch ? name : milestone.id;
	const keys = buildMilestoneMatchKeys(baseValue, [milestone]);
	for (const key of buildMilestoneMatchKeys(milestone.id, [milestone])) {
		keys.add(key);
	}
	const titleKey = milestoneKey(milestone.title);
	if (titleKey) {
		if (includeTitleMatch) {
			keys.add(titleKey);
		} else {
			keys.delete(titleKey);
		}
	}
	return keys;
}

function buildMilestoneRecordMatchKeys(milestone: Milestone): Set<string> {
	const keys = buildMilestoneMatchKeys(milestone.id, [milestone]);
	const titleKey = milestoneKey(milestone.title);
	if (titleKey) {
		keys.add(titleKey);
	}
	return keys;
}

function hasMilestoneTitleAliasCollision(sourceMilestone: Milestone, candidates: Milestone[]): boolean {
	const sourceMilestoneIdKey = milestoneKey(sourceMilestone.id);
	const sourceTitleKey = milestoneKey(sourceMilestone.title);
	if (!sourceTitleKey) {
		return false;
	}
	return candidates.some((candidate) => {
		if (milestoneKey(candidate.id) === sourceMilestoneIdKey) {
			return false;
		}
		return buildMilestoneRecordMatchKeys(candidate).has(sourceTitleKey);
	});
}

function resolveMilestoneValueForReporting(
	value: string,
	activeMilestones: Milestone[],
	archivedMilestones: Milestone[],
): string {
	const normalized = normalizeMilestoneName(value);
	if (!normalized) {
		return "";
	}
	const inputKey = milestoneKey(normalized);
	const looksLikeMilestoneId = /^\d+$/.test(normalized) || /^m-\d+$/i.test(normalized);
	const canonicalInputId = looksLikeMilestoneId
		? `m-${String(Number.parseInt(normalized.replace(/^m-/i, ""), 10))}`
		: null;
	const aliasKeys = new Set<string>([inputKey]);
	if (canonicalInputId) {
		const numericAlias = canonicalInputId.replace(/^m-/, "");
		aliasKeys.add(canonicalInputId);
		aliasKeys.add(numericAlias);
	}

	const idMatchesAlias = (milestoneId: string): boolean => {
		const idKey = milestoneKey(milestoneId);
		if (aliasKeys.has(idKey)) {
			return true;
		}
		const idMatch = milestoneId.trim().match(/^m-(\d+)$/i);
		if (!idMatch?.[1]) {
			return false;
		}
		const numericAlias = String(Number.parseInt(idMatch[1], 10));
		return aliasKeys.has(`m-${numericAlias}`) || aliasKeys.has(numericAlias);
	};
	const findIdMatch = (milestones: Milestone[]): Milestone | undefined => {
		const rawExactMatch = milestones.find((milestone) => milestoneKey(milestone.id) === inputKey);
		if (rawExactMatch) {
			return rawExactMatch;
		}
		if (canonicalInputId) {
			const canonicalRawMatch = milestones.find((milestone) => milestoneKey(milestone.id) === canonicalInputId);
			if (canonicalRawMatch) {
				return canonicalRawMatch;
			}
		}
		return milestones.find((milestone) => idMatchesAlias(milestone.id));
	};
	const findUniqueTitleMatch = (milestones: Milestone[]): Milestone | undefined => {
		const titleMatches = milestones.filter((milestone) => milestoneKey(milestone.title) === inputKey);
		return titleMatches.length === 1 ? titleMatches[0] : undefined;
	};

	const activeTitleMatches = activeMilestones.filter((milestone) => milestoneKey(milestone.title) === inputKey);
	if (looksLikeMilestoneId) {
		const activeIdMatch = findIdMatch(activeMilestones);
		if (activeIdMatch) {
			return activeIdMatch.id;
		}
		const archivedIdMatch = findIdMatch(archivedMilestones);
		if (archivedIdMatch) {
			return archivedIdMatch.id;
		}
		if (activeTitleMatches.length === 1) {
			return activeTitleMatches[0]?.id ?? normalized;
		}
		if (activeTitleMatches.length > 1) {
			return normalized;
		}
		return findUniqueTitleMatch(archivedMilestones)?.id ?? normalized;
	}

	const activeTitleMatch = findUniqueTitleMatch(activeMilestones);
	if (activeTitleMatch) {
		return activeTitleMatch.id;
	}
	if (activeTitleMatches.length > 1) {
		return normalized;
	}
	const activeIdMatch = findIdMatch(activeMilestones);
	if (activeIdMatch) {
		return activeIdMatch.id;
	}
	const archivedTitleMatch = findUniqueTitleMatch(archivedMilestones);
	if (archivedTitleMatch) {
		return archivedTitleMatch.id;
	}
	return findIdMatch(archivedMilestones)?.id ?? normalized;
}

export class MilestoneHandlers {
	constructor(private readonly core: McpServer) {}

	private async listLocalStates(): Promise<State[]> {
		return await this.core.queryStates({ includeCrossBranch: false });
	}

	private async rollbackStateMilestones(previousMilestones: Map<string, string | undefined>): Promise<string[]> {
		const failedStateIds: string[] = [];
		for (const [stateId, milestone] of previousMilestones.entries()) {
			try {
				await this.core.editState(stateId, { milestone: milestone ?? null }, false);
			} catch {
				failedStateIds.push(stateId);
			}
		}
		return failedStateIds.sort((a, b) => a.localeCompare(b));
	}

	private async commitMilestoneMutation(
		commitMessage: string,
		options: {
			sourcePath?: string;
			targetPath?: string;
			stateFilePaths?: Iterable<string>;
		},
	): Promise<void> {
		const shouldAutoCommit = await this.core.shouldAutoCommit();
		if (!shouldAutoCommit) {
			return;
		}

		let repoRoot: string | null = null;
		const commitPaths: string[] = [];
		if (options.sourcePath && options.targetPath) {
			repoRoot = await this.core.git.stageFileMove(options.sourcePath, options.targetPath);
			commitPaths.push(options.sourcePath, options.targetPath);
		}
		for (const filePath of options.stateFilePaths ?? []) {
			await this.core.git.addFile(filePath);
			commitPaths.push(filePath);
		}
		try {
			await this.core.git.commitFiles(commitMessage, commitPaths, repoRoot);
		} catch (error) {
			await this.core.git.resetPaths(commitPaths, repoRoot);
			throw error;
		}
	}

	private async listFileMilestones(): Promise<Milestone[]> {
		return await this.core.filesystem.listMilestones();
	}

	private async listArchivedMilestones(): Promise<Milestone[]> {
		return await this.core.filesystem.listArchivedMilestones();
	}

	async listMilestones(): Promise<CallToolResult> {
		// Get file-based milestones
		const fileMilestones = await this.listFileMilestones();
		const archivedMilestones = await this.listArchivedMilestones();
		const reservedIdKeys = new Set<string>();
		for (const milestone of [...fileMilestones, ...archivedMilestones]) {
			for (const key of buildMilestoneMatchKeys(milestone.id, [])) {
				reservedIdKeys.add(key);
			}
		}
		const activeTitleCounts = new Map<string, number>();
		for (const milestone of fileMilestones) {
			const titleKey = milestoneKey(milestone.title);
			if (!titleKey) continue;
			activeTitleCounts.set(titleKey, (activeTitleCounts.get(titleKey) ?? 0) + 1);
		}
		const fileMilestoneKeys = new Set<string>();
		for (const milestone of fileMilestones) {
			for (const key of buildMilestoneMatchKeys(milestone.id, [])) {
				fileMilestoneKeys.add(key);
			}
			const titleKey = milestoneKey(milestone.title);
			if (titleKey && !reservedIdKeys.has(titleKey) && activeTitleCounts.get(titleKey) === 1) {
				fileMilestoneKeys.add(titleKey);
			}
		}
		const archivedKeys = new Set<string>(collectArchivedMilestoneKeys(archivedMilestones, fileMilestones));

		// Get milestones discovered from states
		const states = await this.listLocalStates();
		const discoveredByKey = new Map<string, string>();
		for (const state of states) {
			const normalized = normalizeMilestoneName(state.milestone ?? "");
			if (!normalized) continue;
			const canonicalValue = resolveMilestoneValueForReporting(normalized, fileMilestones, archivedMilestones);
			const key = milestoneKey(canonicalValue);
			if (!discoveredByKey.has(key)) {
				discoveredByKey.set(key, canonicalValue);
			}
		}

		const unconfigured = Array.from(discoveredByKey.entries())
			.filter(([key]) => !fileMilestoneKeys.has(key) && !archivedKeys.has(key))
			.map(([, value]) => value)
			.sort((a, b) => a.localeCompare(b));
		const archivedStateValues = Array.from(discoveredByKey.entries())
			.filter(([key]) => !fileMilestoneKeys.has(key) && archivedKeys.has(key))
			.map(([, value]) => value)
			.sort((a, b) => a.localeCompare(b));

		const blocks: string[] = [];
		const milestoneLines = fileMilestones.map((m) => `${m.id}: ${m.title}`);
		blocks.push(formatListBlock(`Milestones (${fileMilestones.length}):`, milestoneLines));
		blocks.push(formatListBlock(`Milestones found on states without files (${unconfigured.length}):`, unconfigured));
		blocks.push(
			formatListBlock(`Archived milestone values still on states (${archivedStateValues.length}):`, archivedStateValues),
		);
		blocks.push(
			"Hint: use milestone_add to create milestone files, milestone_rename / milestone_remove to manage, milestone_archive to archive.",
		);

		return {
			content: [
				{
					type: "text",
					text: blocks.join("\n\n"),
				},
			],
		};
	}

	async addMilestone(args: MilestoneAddArgs): Promise<CallToolResult> {
		const name = normalizeMilestoneName(args.name);
		if (!name) {
			throw new McpError("Milestone name cannot be empty.", "VALIDATION_ERROR");
		}

		// Check for duplicates in existing milestone files
		const existing = await this.listFileMilestones();
		const requestedKeys = buildMilestoneMatchKeys(name, existing);
		const duplicate = existing.find((milestone) => {
			const milestoneKeys = buildMilestoneRecordMatchKeys(milestone);
			return keySetsIntersect(requestedKeys, milestoneKeys);
		});
		if (duplicate) {
			throw new McpError(
				`Milestone alias conflict: "${name}" matches existing milestone "${duplicate.title}" (${duplicate.id}).`,
				"VALIDATION_ERROR",
			);
		}

		// Create milestone file
		const milestone = await this.core.filesystem.createMilestone(name, args.description);

		return {
			content: [
				{
					type: "text",
					text: `Created milestone "${milestone.title}" (${milestone.id}).`,
				},
			],
		};
	}

	async renameMilestone(args: MilestoneRenameArgs): Promise<CallToolResult> {
		const fromName = normalizeMilestoneName(args.from);
		const toName = normalizeMilestoneName(args.to);
		if (!fromName || !toName) {
			throw new McpError("Both 'from' and 'to' milestone names are required.", "VALIDATION_ERROR");
		}

		const fileMilestones = await this.listFileMilestones();
		const archivedMilestones = await this.listArchivedMilestones();
		const sourceMilestone = findActiveMilestoneByAlias(fromName, fileMilestones);
		if (!sourceMilestone) {
			throw new McpError(`Milestone not found: "${fromName}"`, "NOT_FOUND");
		}
		if (toName === sourceMilestone.title.trim()) {
			return {
				content: [
					{
						type: "text",
						text: `Milestone "${sourceMilestone.title}" (${sourceMilestone.id}) is already named "${sourceMilestone.title}". No changes made.`,
					},
				],
			};
		}
		const hasTitleCollision = hasMilestoneTitleAliasCollision(sourceMilestone, [
			...fileMilestones,
			...archivedMilestones,
		]);

		const targetKeys = buildMilestoneMatchKeys(toName, fileMilestones);
		const aliasConflict = fileMilestones.find(
			(milestone) =>
				milestoneKey(milestone.id) !== milestoneKey(sourceMilestone.id) &&
				keySetsIntersect(targetKeys, buildMilestoneRecordMatchKeys(milestone)),
		);
		if (aliasConflict) {
			throw new McpError(
				`Milestone alias conflict: "${toName}" matches existing milestone "${aliasConflict.title}" (${aliasConflict.id}).`,
				"VALIDATION_ERROR",
			);
		}

		const targetMilestone = sourceMilestone.id;
		const shouldUpdateStates = args.updateStates ?? true;
		const states = shouldUpdateStates ? await this.listLocalStates() : [];
		const matchKeys = shouldUpdateStates
			? buildStateMatchKeysForMilestone(fromName, sourceMilestone, !hasTitleCollision)
			: new Set<string>();
		const matches = shouldUpdateStates ? states.filter((state) => matchKeys.has(milestoneKey(state.milestone ?? ""))) : [];
		let updatedStateIds: string[] = [];
		const updatedStateFilePaths = new Set<string>();

		const renameResult = await this.core.renameMilestone(sourceMilestone.id, toName, false);
		if (!renameResult.success || !renameResult.milestone) {
			throw new McpError(`Failed to rename milestone "${sourceMilestone.title}".`, "INTERNAL_ERROR");
		}

		const renamedMilestone = renameResult.milestone;
		const previousMilestones = new Map<string, string | undefined>();
		if (shouldUpdateStates) {
			try {
				for (const state of matches) {
					previousMilestones.set(state.id, state.milestone);
					const updatedState = await this.core.editState(state.id, { milestone: targetMilestone }, false);
					const stateFilePath = updatedState.filePath ?? state.filePath;
					if (stateFilePath) {
						updatedStateFilePaths.add(stateFilePath);
					}
					updatedStateIds.push(state.id);
				}
				updatedStateIds = updatedStateIds.sort((a, b) => a.localeCompare(b));
			} catch {
				const rollbackStateFailures = await this.rollbackStateMilestones(previousMilestones);
				const rollbackRenameResult = await this.core.renameMilestone(sourceMilestone.id, sourceMilestone.title, false);
				const rollbackDetails: string[] = [];
				if (!rollbackRenameResult.success) {
					rollbackDetails.push("failed to rollback milestone file rename");
				}
				if (rollbackStateFailures.length > 0) {
					rollbackDetails.push(`failed to rollback state milestones for: ${rollbackStateFailures.join(", ")}`);
				}
				const detailSuffix = rollbackDetails.length > 0 ? ` (${rollbackDetails.join("; ")})` : "";
				throw new McpError(
					`Failed to update state milestones after renaming "${sourceMilestone.title}"${detailSuffix}.`,
					"INTERNAL_ERROR",
				);
			}
		}
		try {
			await this.commitMilestoneMutation(`roadmap: Rename milestone ${sourceMilestone.id}`, {
				sourcePath: renameResult.sourcePath,
				targetPath: renameResult.targetPath,
				stateFilePaths: updatedStateFilePaths,
			});
		} catch {
			const rollbackStateFailures = await this.rollbackStateMilestones(previousMilestones);
			const rollbackRenameResult = await this.core.renameMilestone(sourceMilestone.id, sourceMilestone.title, false);
			const rollbackDetails: string[] = [];
			if (!rollbackRenameResult.success) {
				rollbackDetails.push("failed to rollback milestone file rename");
			}
			if (rollbackStateFailures.length > 0) {
				rollbackDetails.push(`failed to rollback state milestones for: ${rollbackStateFailures.join(", ")}`);
			}
			const detailSuffix = rollbackDetails.length > 0 ? ` (${rollbackDetails.join("; ")})` : "";
			throw new McpError(
				`Failed while finalizing milestone rename "${sourceMilestone.title}"${detailSuffix}.`,
				"INTERNAL_ERROR",
			);
		}

		const summaryLines: string[] = [
			`Renamed milestone "${sourceMilestone.title}" (${sourceMilestone.id}) → "${renamedMilestone.title}" (${renamedMilestone.id}).`,
		];
		if (shouldUpdateStates) {
			summaryLines.push(
				`Updated ${updatedStateIds.length} local state${updatedStateIds.length === 1 ? "" : "s"}: ${formatStateIdList(updatedStateIds)}`,
			);
		} else {
			summaryLines.push("Skipped updating states (updateStates=false).");
		}
		if (renameResult.sourcePath && renameResult.targetPath && renameResult.sourcePath !== renameResult.targetPath) {
			summaryLines.push(`Renamed milestone file: ${renameResult.sourcePath} -> ${renameResult.targetPath}`);
		}

		return {
			content: [
				{
					type: "text",
					text: summaryLines.join("\n"),
				},
			],
		};
	}

	async removeMilestone(args: MilestoneRemoveArgs): Promise<CallToolResult> {
		const name = normalizeMilestoneName(args.name);
		if (!name) {
			throw new McpError("Milestone name cannot be empty.", "VALIDATION_ERROR");
		}

		const fileMilestones = await this.listFileMilestones();
		const archivedMilestones = await this.listArchivedMilestones();
		const sourceMilestone = findActiveMilestoneByAlias(name, fileMilestones);
		if (!sourceMilestone) {
			throw new McpError(`Milestone not found: "${name}"`, "NOT_FOUND");
		}
		const hasTitleCollision = hasMilestoneTitleAliasCollision(sourceMilestone, [
			...fileMilestones,
			...archivedMilestones,
		]);
		const removeKeys = buildStateMatchKeysForMilestone(name, sourceMilestone, !hasTitleCollision);
		const stateHandling = args.stateHandling ?? "clear";
		const reassignTo = normalizeMilestoneName(args.reassignTo ?? "");
		const targetMilestone =
			stateHandling === "reassign" ? findActiveMilestoneByAlias(reassignTo, fileMilestones) : undefined;
		const reassignedMilestone = targetMilestone?.id ?? "";

		if (stateHandling === "reassign") {
			if (!reassignTo) {
				throw new McpError("reassignTo is required when stateHandling is reassign.", "VALIDATION_ERROR");
			}
			if (!targetMilestone) {
				throw new McpError(`Target milestone not found: "${reassignTo}"`, "VALIDATION_ERROR");
			}
			if (milestoneKey(targetMilestone.id) === milestoneKey(sourceMilestone.id)) {
				throw new McpError("reassignTo must be different from the removed milestone.", "VALIDATION_ERROR");
			}
		}

		const states = stateHandling !== "keep" ? await this.listLocalStates() : [];
		const matches =
			stateHandling !== "keep" ? states.filter((state) => removeKeys.has(milestoneKey(state.milestone ?? ""))) : [];
		const previousMilestones = new Map<string, string | undefined>();
		let updatedStateIds: string[] = [];
		const updatedStateFilePaths = new Set<string>();
		if (stateHandling !== "keep") {
			try {
				for (const state of matches) {
					previousMilestones.set(state.id, state.milestone);
					const updatedState = await this.core.editState(
						state.id,
						{ milestone: stateHandling === "reassign" ? reassignedMilestone : null },
						false,
					);
					const stateFilePath = updatedState.filePath ?? state.filePath;
					if (stateFilePath) {
						updatedStateFilePaths.add(stateFilePath);
					}
					updatedStateIds.push(state.id);
				}
				updatedStateIds = updatedStateIds.sort((a, b) => a.localeCompare(b));
			} catch {
				const rollbackFailures = await this.rollbackStateMilestones(previousMilestones);
				const detailSuffix =
					rollbackFailures.length > 0 ? ` (failed rollback for: ${rollbackFailures.join(", ")})` : "";
				throw new McpError(
					`Failed while updating states for milestone removal "${sourceMilestone.title}"${detailSuffix}.`,
					"INTERNAL_ERROR",
				);
			}
		}

		const archiveResult = await this.core.archiveMilestone(sourceMilestone.id, false);
		if (!archiveResult.success) {
			let detailSuffix = "";
			if (stateHandling !== "keep") {
				const rollbackFailures = await this.rollbackStateMilestones(previousMilestones);
				if (rollbackFailures.length > 0) {
					detailSuffix = ` (failed rollback for: ${rollbackFailures.join(", ")})`;
				}
			}
			throw new McpError(
				`Failed to archive milestone "${sourceMilestone.title}" before removal.${detailSuffix}`,
				"INTERNAL_ERROR",
			);
		}
		try {
			await this.commitMilestoneMutation(`roadmap: Remove milestone ${sourceMilestone.id}`, {
				sourcePath: archiveResult.sourcePath,
				targetPath: archiveResult.targetPath,
				stateFilePaths: updatedStateFilePaths,
			});
		} catch {
			const rollbackDetails: string[] = [];
			if (archiveResult.sourcePath && archiveResult.targetPath) {
				try {
					await moveFile(archiveResult.targetPath, archiveResult.sourcePath);
				} catch {
					rollbackDetails.push("failed to rollback milestone archive");
				}
			}
			if (stateHandling !== "keep") {
				const rollbackFailures = await this.rollbackStateMilestones(previousMilestones);
				if (rollbackFailures.length > 0) {
					rollbackDetails.push(`failed rollback for: ${rollbackFailures.join(", ")}`);
				}
			}
			const detailSuffix = rollbackDetails.length > 0 ? ` (${rollbackDetails.join("; ")})` : "";
			throw new McpError(
				`Failed while finalizing milestone removal "${sourceMilestone.title}"${detailSuffix}.`,
				"INTERNAL_ERROR",
			);
		}

		const summaryLines: string[] = [`Removed milestone "${sourceMilestone.title}" (${sourceMilestone.id}).`];
		if (stateHandling === "keep") {
			summaryLines.push("Kept state milestone values unchanged (stateHandling=keep).");
		} else if (stateHandling === "reassign") {
			const targetSummary = `"${targetMilestone?.title}" (${reassignedMilestone})`;
			summaryLines.push(
				`Reassigned ${updatedStateIds.length} local state${updatedStateIds.length === 1 ? "" : "s"} to ${targetSummary}: ${formatStateIdList(updatedStateIds)}`,
			);
		} else {
			summaryLines.push(
				`Cleared milestone for ${updatedStateIds.length} local state${updatedStateIds.length === 1 ? "" : "s"}: ${formatStateIdList(updatedStateIds)}`,
			);
		}
		return {
			content: [
				{
					type: "text",
					text: summaryLines.join("\n"),
				},
			],
		};
	}

	async archiveMilestone(args: MilestoneArchiveArgs): Promise<CallToolResult> {
		const name = normalizeMilestoneName(args.name);
		if (!name) {
			throw new McpError("Milestone name cannot be empty.", "VALIDATION_ERROR");
		}

		const result = await this.core.archiveMilestone(name);
		if (!result.success) {
			throw new McpError(`Milestone not found: "${name}"`, "NOT_FOUND");
		}

		const label = result.milestone?.title ?? name;
		const id = result.milestone?.id;

		return {
			content: [
				{
					type: "text",
					text: `Archived milestone "${label}"${id ? ` (${id})` : ""}.`,
				},
			],
		};
	}
}
