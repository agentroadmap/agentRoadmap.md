import { rename as moveFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import { DEFAULT_DIRECTORIES, DEFAULT_STATUSES, FALLBACK_STATUS } from "../constants/index.ts";
import { FileSystem } from "../file-system/operations.ts";
import { GitOperations } from "../git/operations.ts";
import {
	type AcceptanceCriterion,
	type RoadmapConfig,
	type Decision,
	type Document,
	EntityType,
	isLocalEditableState,
	type Milestone,
	type SearchFilters,
	type Sequence,
	type State,
	type StateCreateInput,
	type StateListFilter,
	type StateUpdateInput,
} from "../types/index.ts";
import { normalizeAssignee } from "../utils/assignee.ts";
import { documentIdsEqual } from "../utils/document-id.ts";
import { openInEditor } from "../utils/editor.ts";
import {
	createMilestoneFilterValueResolver,
	normalizeMilestoneFilterValue,
	resolveClosestMilestoneFilterValue,
} from "../utils/milestone-filter.ts";
import { buildIdRegex, extractAnyPrefix, getPrefixForType, normalizeId } from "../utils/prefix-config.ts";
import {
	getCanonicalStatus as resolveCanonicalStatus,
	getValidStatuses as resolveValidStatuses,
} from "../utils/status.ts";
import { executeStatusCallback } from "../utils/status-callback.ts";
import {
	buildDefinitionOfDoneItems,
	normalizeDependencies,
	normalizeStringList,
	stringArraysEqual,
	validateDependencies,
} from "../utils/state-builders.ts";
import { getStateFilename, getStatePath, normalizeStateId, stateIdsEqual } from "../utils/state-path.ts";
import { attachSubstateSummaries } from "../utils/state-substates.ts";
import { upsertStateUpdatedDate } from "../utils/state-updated-date.ts";
import { migrateConfig, needsMigration } from "./config-migration.ts";
import { ContentStore } from "./content-store.ts";
import { migrateDraftPrefixes, needsDraftPrefixMigration } from "./prefix-migration.ts";
import { calculateNewOrdinal, DEFAULT_ORDINAL_STEP, resolveOrdinalConflicts } from "./reorder.ts";
import { SearchService } from "./search-service.ts";
import { computeSequences, planMoveToSequence, planMoveToUnsequenced } from "./sequences.ts";
import {
	type BranchStateStateEntry,
	findStateInLocalBranches,
	findStateInRemoteBranches,
	getStateLoadingMessage,
	loadLocalBranchStates,
	loadRemoteStates,
	resolveStateConflict,
} from "./state-loader.ts";

interface BlessedScreen {
	program: {
		disableMouse(): void;
		enableMouse(): void;
		hideCursor(): void;
		showCursor(): void;
		input: NodeJS.EventEmitter;
		pause?: () => (() => void) | undefined;
		flush?: () => void;
		put?: {
			keypad_local?: () => void;
			keypad_xmit?: () => void;
		};
	};
	leave(): void;
	enter(): void;
	render(): void;
	clearRegion(x1: number, x2: number, y1: number, y2: number): void;
	width: number;
	height: number;
	emit(event: string): void;
}

interface StateQueryOptions {
	filters?: StateListFilter;
	query?: string;
	limit?: number;
	includeCrossBranch?: boolean;
}

export type TuiStateEditFailureReason = "not_found" | "read_only" | "editor_failed";

export interface TuiStateEditResult {
	changed: boolean;
	state?: State;
	reason?: TuiStateEditFailureReason;
}

function buildLatestStateMap(
	stateEntries: BranchStateStateEntry[] = [],
	localStates: Array<State & { lastModified?: Date; updatedDate?: string }> = [],
): Map<string, BranchStateStateEntry> {
	const latest = new Map<string, BranchStateStateEntry>();
	const update = (entry: BranchStateStateEntry) => {
		const existing = latest.get(entry.id);
		if (!existing || entry.lastModified > existing.lastModified) {
			latest.set(entry.id, entry);
		}
	};

	for (const entry of stateEntries) {
		update(entry);
	}

	for (const state of localStates) {
		if (!state.id) continue;
		const lastModified = state.lastModified ?? (state.updatedDate ? new Date(state.updatedDate) : new Date(0));

		update({
			id: state.id,
			type: "state",
			branch: "local",
			path: "",
			lastModified,
		});
	}

	return latest;
}

function filterStatesByStateSnapshots(states: State[], latestState: Map<string, BranchStateStateEntry>): State[] {
	return states.filter((state) => {
		const latest = latestState.get(state.id);
		if (!latest) return true;
		return latest.type === "state";
	});
}

/**
 * Extract IDs from state map where latest state is "state" or "completed" (not "archived" or "draft")
 * Used for ID generation to determine which IDs are in use.
 */
function getActiveAndCompletedIdsFromStateMap(latestState: Map<string, BranchStateStateEntry>): string[] {
	const ids: string[] = [];
	for (const [id, entry] of latestState) {
		if (entry.type === "state" || entry.type === "completed") {
			ids.push(id);
		}
	}
	return ids;
}

export class Core {
	public fs: FileSystem;
	public git: GitOperations;
	private contentStore?: ContentStore;
	private searchService?: SearchService;
	private readonly enableWatchers: boolean;

	constructor(projectRoot: string, options?: { enableWatchers?: boolean }) {
		this.fs = new FileSystem(projectRoot);
		this.git = new GitOperations(projectRoot);
		// Disable watchers by default for CLI commands (non-interactive)
		// Interactive modes (TUI, browser, MCP) should explicitly pass enableWatchers: true
		this.enableWatchers = options?.enableWatchers ?? false;
		// Note: Config is loaded lazily when needed since constructor can't be async
	}

	async getContentStore(): Promise<ContentStore> {
		if (!this.contentStore) {
			// Use loadStates as the state loader to include cross-branch states
			this.contentStore = new ContentStore(this.fs, () => this.loadStates(), this.enableWatchers);
		}
		await this.contentStore.ensureInitialized();
		return this.contentStore;
	}

	async getSearchService(): Promise<SearchService> {
		if (!this.searchService) {
			const store = await this.getContentStore();
			this.searchService = new SearchService(store);
		}
		await this.searchService.ensureInitialized();
		return this.searchService;
	}

	private applyStateFilters(
		states: State[],
		filters?: StateListFilter,
		resolveMilestoneFilterValue?: (milestoneValue: string) => string,
	): State[] {
		if (!filters) {
			return states;
		}
		let result = states;
		if (filters.status) {
			const statusLower = filters.status.toLowerCase();
			result = result.filter((state) => (state.status ?? "").toLowerCase() === statusLower);
		}
		if (filters.assignee) {
			const assigneeLower = filters.assignee.toLowerCase();
			result = result.filter((state) => (state.assignee ?? []).some((value) => value.toLowerCase() === assigneeLower));
		}
		if (filters.priority) {
			const priorityLower = String(filters.priority).toLowerCase();
			result = result.filter((state) => (state.priority ?? "").toLowerCase() === priorityLower);
		}
		if (filters.milestone) {
			const milestoneFilter = resolveClosestMilestoneFilterValue(
				filters.milestone,
				result.map((state) => resolveMilestoneFilterValue?.(state.milestone ?? "") ?? state.milestone ?? ""),
			);
			result = result.filter(
				(state) =>
					normalizeMilestoneFilterValue(resolveMilestoneFilterValue?.(state.milestone ?? "") ?? state.milestone ?? "") ===
					milestoneFilter,
			);
		}
		if (filters.parentStateId) {
			const parentFilter = filters.parentStateId;
			result = result.filter((state) => state.parentStateId && stateIdsEqual(parentFilter, state.parentStateId));
		}
		if (filters.labels && filters.labels.length > 0) {
			const requiredLabels = filters.labels.map((label) => label.toLowerCase()).filter(Boolean);
			if (requiredLabels.length > 0) {
				result = result.filter((state) => {
					const stateLabels = state.labels?.map((label) => label.toLowerCase()) || [];
					if (stateLabels.length === 0) return false;
					const labelSet = new Set(stateLabels);
					return requiredLabels.some((label) => labelSet.has(label));
				});
			}
		}
		return result;
	}

	private filterLocalEditableStates(states: State[]): State[] {
		return states.filter(isLocalEditableState);
	}

	private async requireCanonicalStatus(status: string): Promise<string> {
		const canonical = await resolveCanonicalStatus(status, this);
		if (canonical) {
			return canonical;
		}
		const validStatuses = await resolveValidStatuses(this);
		throw new Error(`Invalid status: ${status}. Valid statuses are: ${validStatuses.join(", ")}`);
	}

	private normalizePriority(value: string | undefined): ("high" | "medium" | "low") | undefined {
		if (value === undefined || value === "") {
			return undefined;
		}
		const normalized = value.toLowerCase();
		const allowed = ["high", "medium", "low"] as const;
		if (!allowed.includes(normalized as (typeof allowed)[number])) {
			throw new Error(`Invalid priority: ${value}. Valid values are: high, medium, low`);
		}
		return normalized as "high" | "medium" | "low";
	}

	private isExactStateReference(reference: string, stateId: string): boolean {
		const trimmed = reference.trim();
		if (!trimmed) {
			return false;
		}
		const statePrefix = extractAnyPrefix(stateId);
		const referencePrefix = extractAnyPrefix(trimmed);
		if (!statePrefix || !referencePrefix) {
			return false;
		}
		if (statePrefix.toLowerCase() !== referencePrefix.toLowerCase()) {
			return false;
		}
		return normalizeStateId(trimmed, statePrefix).toLowerCase() === normalizeStateId(stateId, statePrefix).toLowerCase();
	}

	private sanitizeArchivedStateLinks(states: State[], archivedStateId: string): State[] {
		const changedStates: State[] = [];

		for (const state of states) {
			const dependencies = state.dependencies ?? [];
			const references = state.references ?? [];

			const sanitizedDependencies = dependencies.filter((dependency) => !stateIdsEqual(dependency, archivedStateId));
			const sanitizedReferences = references.filter(
				(reference) => !this.isExactStateReference(reference, archivedStateId),
			);

			const dependenciesChanged = !stringArraysEqual(dependencies, sanitizedDependencies);
			const referencesChanged = !stringArraysEqual(references, sanitizedReferences);
			if (!dependenciesChanged && !referencesChanged) {
				continue;
			}

			changedStates.push({
				...state,
				dependencies: sanitizedDependencies,
				references: sanitizedReferences,
			});
		}

		return changedStates;
	}

	async queryStates(options: StateQueryOptions = {}): Promise<State[]> {
		const { filters, query, limit } = options;
		const trimmedQuery = query?.trim();
		const includeCrossBranch = options.includeCrossBranch ?? true;
		const milestoneResolverPromise = filters?.milestone
			? Promise.all([this.fs.listMilestones(), this.fs.listArchivedMilestones()]).then(
					([activeMilestones, archivedMilestones]) =>
						createMilestoneFilterValueResolver([...activeMilestones, ...archivedMilestones]),
				)
			: undefined;

		const applyFiltersAndLimit = async (collection: State[]): Promise<State[]> => {
			const resolveMilestoneFilterValue = milestoneResolverPromise ? await milestoneResolverPromise : undefined;
			let filtered = this.applyStateFilters(collection, filters, resolveMilestoneFilterValue);
			if (!includeCrossBranch) {
				filtered = this.filterLocalEditableStates(filtered);
			}
			if (typeof limit === "number" && limit >= 0) {
				return filtered.slice(0, limit);
			}
			return filtered;
		};

		if (!trimmedQuery) {
			const store = await this.getContentStore();
			const states = store.getStates();
			return await applyFiltersAndLimit(states);
		}

		const searchService = await this.getSearchService();
		const searchFilters: SearchFilters = {};
		if (filters?.status) {
			searchFilters.status = filters.status;
		}
		if (filters?.priority) {
			searchFilters.priority = filters.priority;
		}
		if (filters?.assignee) {
			searchFilters.assignee = filters.assignee;
		}
		if (filters?.labels) {
			searchFilters.labels = filters.labels;
		}

		const searchResults = searchService.search({
			query: trimmedQuery,
			limit,
			types: ["state"],
			filters: Object.keys(searchFilters).length > 0 ? searchFilters : undefined,
		});

		const seen = new Set<string>();
		const states: State[] = [];
		for (const result of searchResults) {
			if (result.type !== "state") continue;
			const state = result.state;
			if (seen.has(state.id)) continue;
			seen.add(state.id);
			states.push(state);
		}

		return await applyFiltersAndLimit(states);
	}

	async getState(stateId: string): Promise<State | null> {
		const store = await this.getContentStore();
		const states = store.getStates();
		const match = states.find((state) => stateIdsEqual(stateId, state.id));
		if (match) {
			return match;
		}

		// Pass raw ID to loadState - it will handle prefix detection via getStatePath
		return await this.fs.loadState(stateId);
	}

	async getStateWithSubstates(stateId: string, localStates?: State[]): Promise<State | null> {
		const state = await this.loadStateById(stateId);
		if (!state) {
			return null;
		}

		const states = localStates ?? (await this.fs.listStates());
		return attachSubstateSummaries(state, states);
	}

	async loadStateById(stateId: string): Promise<State | null> {
		// Pass raw ID to loadState - it will handle prefix detection via getStatePath
		const localState = await this.fs.loadState(stateId);
		if (localState) return localState;

		// Check config for remote operations
		const config = await this.fs.loadConfig();
		const sinceDays = config?.activeBranchDays ?? 30;
		const statePrefix = config?.prefixes?.state ?? "state";

		// For cross-branch search, normalize with configured prefix
		const canonicalId = normalizeStateId(stateId, statePrefix);

		// Try other local branches first (faster than remote)
		const localBranchState = await findStateInLocalBranches(
			this.git,
			canonicalId,
			DEFAULT_DIRECTORIES.ROADMAP,
			sinceDays,
			statePrefix,
		);
		if (localBranchState) return localBranchState;

		// Skip remote if disabled
		if (config?.remoteOperations === false) return null;

		// Try remote branches
		return await findStateInRemoteBranches(this.git, canonicalId, DEFAULT_DIRECTORIES.ROADMAP, sinceDays, statePrefix);
	}

	async getStateContent(stateId: string): Promise<string | null> {
		const filePath = await getStatePath(stateId, this);
		if (!filePath) return null;
		return await Bun.file(filePath).text();
	}

	async getDocument(documentId: string): Promise<Document | null> {
		const documents = await this.fs.listDocuments();
		const match = documents.find((doc) => documentIdsEqual(documentId, doc.id));
		return match ?? null;
	}

	async getDocumentContent(documentId: string): Promise<string | null> {
		const document = await this.getDocument(documentId);
		if (!document) return null;

		const relativePath = document.path ?? `${document.id}.md`;
		const filePath = join(this.fs.docsDir, relativePath);
		try {
			return await Bun.file(filePath).text();
		} catch {
			return null;
		}
	}

	disposeSearchService(): void {
		if (this.searchService) {
			this.searchService.dispose();
			this.searchService = undefined;
		}
	}

	disposeContentStore(): void {
		if (this.contentStore) {
			this.contentStore.dispose();
			this.contentStore = undefined;
		}
	}

	// Backward compatibility aliases
	get filesystem() {
		return this.fs;
	}

	get gitOps() {
		return this.git;
	}

	async ensureConfigLoaded(): Promise<void> {
		try {
			const config = await this.fs.loadConfig();
			this.git.setConfig(config);
		} catch (error) {
			// Config loading failed, git operations will work with null config
			if (process.env.DEBUG) {
				console.warn("Failed to load config for git operations:", error);
			}
		}
	}

	private async getRoadmapDirectoryName(): Promise<string> {
		// Always use "roadmap" as the directory name
		return DEFAULT_DIRECTORIES.ROADMAP;
	}

	async shouldAutoCommit(overrideValue?: boolean): Promise<boolean> {
		// If override is explicitly provided, use it
		if (overrideValue !== undefined) {
			return overrideValue;
		}
		// Otherwise, check config (default to false for safety)
		const config = await this.fs.loadConfig();
		return config?.autoCommit ?? false;
	}

	async getGitOps() {
		await this.ensureConfigLoaded();
		return this.git;
	}

	// Config migration
	private parseLegacyInlineArray(value: string): string[] {
		const items: string[] = [];
		let current = "";
		let quote: '"' | "'" | null = null;

		const pushCurrent = () => {
			const normalized = current.trim().replace(/\\(['"])/g, "$1");
			if (normalized) {
				items.push(normalized);
			}
			current = "";
		};

		for (let i = 0; i < value.length; i += 1) {
			const ch = value[i];
			const prev = i > 0 ? value[i - 1] : "";
			if (quote) {
				if (ch === quote && prev !== "\\") {
					quote = null;
					continue;
				}
				current += ch;
				continue;
			}
			if (ch === '"' || ch === "'") {
				quote = ch;
				continue;
			}
			if (ch === ",") {
				pushCurrent();
				continue;
			}
			current += ch;
		}
		pushCurrent();
		return items;
	}

	private stripYamlComment(value: string): string {
		let quote: '"' | "'" | null = null;
		for (let i = 0; i < value.length; i += 1) {
			const ch = value[i];
			const prev = i > 0 ? value[i - 1] : "";
			if (quote) {
				if (ch === quote && prev !== "\\") {
					quote = null;
				}
				continue;
			}
			if (ch === '"' || ch === "'") {
				quote = ch;
				continue;
			}
			if (ch === "#") {
				return value.slice(0, i).trimEnd();
			}
		}
		return value;
	}

	private parseLegacyYamlValue(value: string): string {
		const trimmed = this.stripYamlComment(value).trim();
		const singleQuoted = trimmed.match(/^'(.*)'$/);
		if (singleQuoted?.[1] !== undefined) {
			return singleQuoted[1].replace(/''/g, "'");
		}
		const doubleQuoted = trimmed.match(/^"(.*)"$/);
		if (doubleQuoted?.[1] !== undefined) {
			return doubleQuoted[1].replace(/\\"/g, '"').replace(/\\'/g, "'");
		}
		return trimmed;
	}

	private async extractLegacyConfigMilestones(): Promise<string[]> {
		try {
			const configPath = join(this.fs.rootDir, DEFAULT_DIRECTORIES.ROADMAP, "config.yml");
			const content = await Bun.file(configPath).text();
			const lines = content.split("\n");
			for (let i = 0; i < lines.length; i += 1) {
				const line = lines[i] ?? "";
				const match = line.match(/^(\s*)milestones\s*:\s*(.*)$/);
				if (!match) {
					continue;
				}

				const milestoneIndent = (match[1] ?? "").length;
				const trailing = this.stripYamlComment(match[2] ?? "").trim();
				if (trailing.startsWith("[")) {
					let combined = trailing;
					let closed = trailing.endsWith("]");
					let j = i + 1;
					while (!closed && j < lines.length) {
						const segment = this.stripYamlComment(lines[j] ?? "").trim();
						combined += segment;
						if (segment.includes("]")) {
							closed = true;
							break;
						}
						j += 1;
					}
					if (closed) {
						const openIndex = combined.indexOf("[");
						const closeIndex = combined.lastIndexOf("]");
						if (openIndex !== -1 && closeIndex > openIndex) {
							const parsed = this.parseLegacyInlineArray(combined.slice(openIndex + 1, closeIndex));
							return parsed.map((item) => this.parseLegacyYamlValue(item)).filter(Boolean);
						}
					}
				}
				if (trailing.length > 0) {
					const single = this.parseLegacyYamlValue(trailing);
					return single ? [single] : [];
				}

				const values: string[] = [];
				for (let j = i + 1; j < lines.length; j += 1) {
					const nextLine = lines[j] ?? "";
					if (!nextLine.trim()) {
						continue;
					}
					const nextIndent = nextLine.match(/^\s*/)?.[0].length ?? 0;
					if (nextIndent <= milestoneIndent) {
						break;
					}
					const trimmed = nextLine.trim();
					if (!trimmed.startsWith("-")) {
						continue;
					}
					const itemValue = this.parseLegacyYamlValue(trimmed.slice(1));
					if (itemValue) {
						values.push(itemValue);
					}
				}
				return values;
			}
			return [];
		} catch {
			return [];
		}
	}

	private async migrateLegacyConfigMilestonesToFiles(legacyMilestones: string[]): Promise<void> {
		if (legacyMilestones.length === 0) {
			return;
		}
		const existingMilestones = await this.fs.listMilestones();
		const existingKeys = new Set<string>();
		for (const milestone of existingMilestones) {
			const idKey = milestone.id.trim().toLowerCase();
			const titleKey = milestone.title.trim().toLowerCase();
			if (idKey) {
				existingKeys.add(idKey);
			}
			if (titleKey) {
				existingKeys.add(titleKey);
			}
		}
		for (const name of legacyMilestones) {
			const normalized = name.trim();
			const key = normalized.toLowerCase();
			if (!normalized || existingKeys.has(key)) {
				continue;
			}
			const created = await this.fs.createMilestone(normalized);
			const createdIdKey = created.id.trim().toLowerCase();
			const createdTitleKey = created.title.trim().toLowerCase();
			if (createdIdKey) {
				existingKeys.add(createdIdKey);
			}
			if (createdTitleKey) {
				existingKeys.add(createdTitleKey);
			}
		}
	}

	async ensureConfigMigrated(): Promise<void> {
		await this.ensureConfigLoaded();
		const legacyMilestones = await this.extractLegacyConfigMilestones();
		let config = await this.fs.loadConfig();
		const needsSchemaMigration = !config || needsMigration(config);

		if (needsSchemaMigration) {
			config = migrateConfig(config || {});
		}
		if (legacyMilestones.length > 0) {
			await this.migrateLegacyConfigMilestonesToFiles(legacyMilestones);
		}
		if (config && (needsSchemaMigration || legacyMilestones.length > 0)) {
			// Rewrite config to apply schema defaults and strip legacy milestones key after successful migration.
			await this.fs.saveConfig(config);
		}

		// Run draft prefix migration if needed (one-time migration)
		// This renames state-*.md files in drafts/ to draft-*.md
		if (needsDraftPrefixMigration(config)) {
			await migrateDraftPrefixes(this.fs);
		}
	}

	// ID generation
	/**
	 * Generates the next ID for a given entity type.
	 *
	 * @param type - The entity type (State, Draft, Document, Decision). Defaults to State.
	 * @param parent - Optional parent ID for substate generation (only applicable for states).
	 * @returns The next available ID (e.g., "state-42", "draft-5", "doc-3")
	 *
	 * Folder scanning by type:
	 * - State: /states, /completed, cross-branch (if enabled), remote (if enabled)
	 * - Draft: /drafts only
	 * - Document: /documents only
	 * - Decision: /decisions only
	 */
	async generateNextId(type: EntityType = EntityType.State, parent?: string): Promise<string> {
		const config = await this.fs.loadConfig();
		const prefix = getPrefixForType(type, config ?? undefined);

		// Collect existing IDs based on entity type
		const allIds = await this.getExistingIdsForType(type);

		if (parent) {
			// Substate generation (only applicable for states)
			const normalizedParent = allIds.find((id) => stateIdsEqual(parent, id)) ?? normalizeStateId(parent);
			const upperParent = normalizedParent.toUpperCase();
			let max = 0;
			for (const id of allIds) {
				// Case-insensitive comparison to handle legacy lowercase IDs
				if (id.toUpperCase().startsWith(`${upperParent}.`)) {
					const rest = id.slice(normalizedParent.length + 1);
					const num = Number.parseInt(rest.split(".")[0] || "0", 10);
					if (num > max) max = num;
				}
			}
			const nextSubIdNumber = max + 1;
			const padding = config?.zeroPaddedIds;

			if (padding && padding > 0) {
				const paddedSubId = String(nextSubIdNumber).padStart(2, "0");
				return `${normalizedParent}.${paddedSubId}`;
			}

			return `${normalizedParent}.${nextSubIdNumber}`;
		}

		// Top-level ID generation using prefix-aware regex
		const regex = buildIdRegex(prefix);
		const upperPrefix = prefix.toUpperCase();
		let max = 0;
		for (const id of allIds) {
			const match = id.match(regex);
			if (match?.[1] && !match[1].includes(".")) {
				const num = Number.parseInt(match[1], 10);
				if (num > max) max = num;
			}
		}
		const nextIdNumber = max + 1;
		const padding = config?.zeroPaddedIds;

		if (padding && padding > 0) {
			const paddedId = String(nextIdNumber).padStart(padding, "0");
			return `${upperPrefix}-${paddedId}`;
		}

		return `${upperPrefix}-${nextIdNumber}`;
	}

	/**
	 * Gets all state IDs that are in use (active or completed) across all branches.
	 * Respects cross-branch config settings. Archived IDs are excluded (can be reused).
	 *
	 * This is used for ID generation to determine the next available ID.
	 */
	private async getActiveAndCompletedStateIds(): Promise<string[]> {
		const config = await this.fs.loadConfig();

		// Load local active and completed states
		const localStates = await this.listStatesWithMetadata();
		const localCompletedStates = await this.fs.listCompletedStates();

		// Build initial state entries from local states
		const stateEntries: BranchStateStateEntry[] = [];

		// Add local active states to state
		for (const state of localStates) {
			if (!state.id) continue;
			const lastModified = state.lastModified ?? (state.updatedDate ? new Date(state.updatedDate) : new Date(0));
			stateEntries.push({
				id: state.id,
				type: "state",
				branch: "local",
				path: "",
				lastModified,
			});
		}

		// Add local completed states to state
		for (const state of localCompletedStates) {
			if (!state.id) continue;
			const lastModified = state.updatedDate ? new Date(state.updatedDate) : new Date(0);
			stateEntries.push({
				id: state.id,
				type: "completed",
				branch: "local",
				path: "",
				lastModified,
			});
		}

		// If cross-branch checking is enabled, scan other branches for state states
		if (config?.checkActiveBranches !== false) {
			const branchStateEntries: BranchStateStateEntry[] = [];

			// Load states from remote and local branches in parallel
			await Promise.all([
				loadRemoteStates(this.git, config, undefined, localStates, branchStateEntries),
				loadLocalBranchStates(this.git, config, undefined, localStates, branchStateEntries),
			]);

			// Add branch state entries
			stateEntries.push(...branchStateEntries);
		}

		// Build the latest state map and extract active + completed IDs
		const latestState = buildLatestStateMap(stateEntries, []);
		return getActiveAndCompletedIdsFromStateMap(latestState);
	}

	/**
	 * Gets all existing IDs for a given entity type.
	 * Used internally by generateNextId to determine the next available ID.
	 *
	 * Note: Archived states are intentionally excluded - archived IDs can be reused.
	 * This makes archive act as a soft delete for ID purposes.
	 */
	private async getExistingIdsForType(type: EntityType): Promise<string[]> {
		switch (type) {
			case EntityType.State: {
				// Get active + completed state IDs from all branches (respects config)
				// Archived IDs are excluded - they can be reused (soft delete behavior)
				return this.getActiveAndCompletedStateIds();
			}
			case EntityType.Draft: {
				const drafts = await this.fs.listDrafts();
				return drafts.map((d) => d.id);
			}
			case EntityType.Document: {
				const documents = await this.fs.listDocuments();
				return documents.map((d) => d.id);
			}
			case EntityType.Decision: {
				const decisions = await this.fs.listDecisions();
				return decisions.map((d) => d.id);
			}
			default:
				return [];
		}
	}

	// High-level operations that combine filesystem and git
	async createStateFromData(
		stateData: {
			title: string;
			status?: string;
			assignee?: string[];
			labels?: string[];
			dependencies?: string[];
			parentStateId?: string;
			priority?: "high" | "medium" | "low";
			// First-party structured fields from Web UI / CLI
			description?: string;
			acceptanceCriteriaItems?: import("../types/index.ts").AcceptanceCriterion[];
			implementationPlan?: string;
			implementationNotes?: string;
			finalSummary?: string;
			milestone?: string;
		},
		autoCommit?: boolean,
	): Promise<State> {
		// Determine entity type before generating ID - drafts get DRAFT-X, states get STATE-X
		const isDraft = stateData.status?.toLowerCase() === "draft";
		const entityType = isDraft ? EntityType.Draft : EntityType.State;
		const id = await this.generateNextId(entityType, isDraft ? undefined : stateData.parentStateId);

		const state: State = {
			id,
			title: stateData.title,
			status: stateData.status || "",
			assignee: stateData.assignee || [],
			labels: stateData.labels || [],
			dependencies: stateData.dependencies || [],
			rawContent: "",
			createdDate: new Date().toISOString().slice(0, 16).replace("T", " "),
			...(stateData.parentStateId && { parentStateId: stateData.parentStateId }),
			...(stateData.priority && { priority: stateData.priority }),
			...(typeof stateData.milestone === "string" &&
				stateData.milestone.trim().length > 0 && {
					milestone: stateData.milestone.trim(),
				}),
			...(typeof stateData.description === "string" && { description: stateData.description }),
			...(Array.isArray(stateData.acceptanceCriteriaItems) &&
				stateData.acceptanceCriteriaItems.length > 0 && {
					acceptanceCriteriaItems: stateData.acceptanceCriteriaItems,
				}),
			...(typeof stateData.implementationPlan === "string" && { implementationPlan: stateData.implementationPlan }),
			...(typeof stateData.implementationNotes === "string" && { implementationNotes: stateData.implementationNotes }),
			...(typeof stateData.finalSummary === "string" && { finalSummary: stateData.finalSummary }),
		};

		// Save as draft or state based on status
		if (isDraft) {
			await this.createDraft(state, autoCommit);
		} else {
			await this.createState(state, autoCommit);
		}

		return state;
	}

	async createStateFromInput(input: StateCreateInput, autoCommit?: boolean): Promise<{ state: State; filePath?: string }> {
		if (!input.title || input.title.trim().length === 0) {
			throw new Error("Title is required to create a state.");
		}

		// Determine if this is a draft BEFORE generating the ID
		const requestedStatus = input.status?.trim();
		const isDraft = requestedStatus?.toLowerCase() === "draft";

		// Generate ID with appropriate entity type - drafts get DRAFT-X, states get STATE-X
		const entityType = isDraft ? EntityType.Draft : EntityType.State;
		const id = await this.generateNextId(entityType, isDraft ? undefined : input.parentStateId);

		const normalizedLabels = normalizeStringList(input.labels) ?? [];
		const normalizedAssignees = normalizeStringList(input.assignee) ?? [];
		const normalizedDependencies = normalizeDependencies(input.dependencies);
		const normalizedReferences = normalizeStringList(input.references) ?? [];
		const normalizedDocumentation = normalizeStringList(input.documentation) ?? [];

		const { valid: validDependencies, invalid: invalidDependencies } = await validateDependencies(
			normalizedDependencies,
			this,
		);
		if (invalidDependencies.length > 0) {
			throw new Error(
				`The following dependencies do not exist: ${invalidDependencies.join(", ")}. Please create these states first or verify the IDs.`,
			);
		}

		let status = "";
		if (requestedStatus) {
			if (isDraft) {
				status = "Draft";
			} else {
				status = await this.requireCanonicalStatus(requestedStatus);
			}
		}

		const priority = this.normalizePriority(input.priority);
		const createdDate = new Date().toISOString().slice(0, 16).replace("T", " ");

		const acceptanceCriteriaItems = Array.isArray(input.acceptanceCriteria)
			? input.acceptanceCriteria
					.map((criterion, index) => ({
						index: index + 1,
						text: String(criterion.text ?? "").trim(),
						checked: Boolean(criterion.checked),
					}))
					.filter((criterion) => criterion.text.length > 0)
			: [];
		const config = await this.fs.loadConfig();
		const definitionOfDoneItems = buildDefinitionOfDoneItems({
			defaults: config?.definitionOfDone,
			add: input.definitionOfDoneAdd,
			disableDefaults: input.disableDefinitionOfDoneDefaults,
		});

		const state: State = {
			id,
			title: input.title.trim(),
			status,
			assignee: normalizedAssignees,
			labels: normalizedLabels,
			dependencies: validDependencies,
			references: normalizedReferences,
			documentation: normalizedDocumentation,
			rawContent: input.rawContent ?? "",
			createdDate,
			...(input.parentStateId && { parentStateId: input.parentStateId }),
			...(priority && { priority }),
			...(typeof input.milestone === "string" &&
				input.milestone.trim().length > 0 && {
					milestone: input.milestone.trim(),
				}),
			...(typeof input.description === "string" && { description: input.description }),
			...(typeof input.implementationPlan === "string" && { implementationPlan: input.implementationPlan }),
			...(typeof input.implementationNotes === "string" && { implementationNotes: input.implementationNotes }),
			...(typeof input.finalSummary === "string" && { finalSummary: input.finalSummary }),
			...(acceptanceCriteriaItems.length > 0 && { acceptanceCriteriaItems }),
			...(definitionOfDoneItems && definitionOfDoneItems.length > 0 && { definitionOfDoneItems }),
		};

		const filePath = isDraft ? await this.createDraft(state, autoCommit) : await this.createState(state, autoCommit);

		// Load the saved state/draft to return updated data
		const savedState = isDraft ? await this.fs.loadDraft(id) : await this.fs.loadState(id);
		return { state: savedState ?? state, filePath };
	}

	async createState(state: State, autoCommit?: boolean): Promise<string> {
		if (!state.status) {
			const config = await this.fs.loadConfig();
			state.status = config?.defaultStatus || FALLBACK_STATUS;
		}

		normalizeAssignee(state);

		const filepath = await this.fs.saveState(state);
		// Keep any in-process ContentStore in sync for immediate UI/search freshness.
		if (this.contentStore) {
			const savedState = await this.fs.loadState(state.id);
			if (savedState) {
				this.contentStore.upsertState(savedState);
			}
		}

		if (await this.shouldAutoCommit(autoCommit)) {
			await this.git.addAndCommitStateFile(state.id, filepath, "create");
		}

		return filepath;
	}

	async createDraft(state: State, autoCommit?: boolean): Promise<string> {
		// Drafts always have status "Draft", regardless of config default
		state.status = "Draft";
		normalizeAssignee(state);

		const filepath = await this.fs.saveDraft(state);

		if (await this.shouldAutoCommit(autoCommit)) {
			await this.git.addFile(filepath);
			await this.git.commitStateChange(state.id, `Create draft ${state.id}`, filepath);
		}

		return filepath;
	}

	async updateState(state: State, autoCommit?: boolean): Promise<void> {
		normalizeAssignee(state);

		// Load original state to detect status changes for callbacks
		const originalState = await this.fs.loadState(state.id);
		const oldStatus = originalState?.status ?? "";
		const newStatus = state.status ?? "";
		const statusChanged = oldStatus !== newStatus;

		// Always set updatedDate when updating a state
		state.updatedDate = new Date().toISOString().slice(0, 16).replace("T", " ");

		await this.fs.saveState(state);
		// Keep any in-process ContentStore in sync for immediate UI/search freshness.
		if (this.contentStore) {
			const savedState = await this.fs.loadState(state.id);
			if (savedState) {
				this.contentStore.upsertState(savedState);
			}
		}

		if (await this.shouldAutoCommit(autoCommit)) {
			const filePath = await getStatePath(state.id, this);
			if (filePath) {
				await this.git.addAndCommitStateFile(state.id, filePath, "update");
			}
		}

		// Fire status change callback if status changed
		if (statusChanged) {
			await this.executeStatusChangeCallback(state, oldStatus, newStatus);
		}
	}

	private async applyStateUpdateInput(
		state: State,
		input: StateUpdateInput,
		statusResolver: (status: string) => Promise<string>,
	): Promise<{ state: State; mutated: boolean }> {
		let mutated = false;

		const applyStringField = (
			value: string | undefined,
			current: string | undefined,
			assign: (next: string) => void,
		) => {
			if (typeof value === "string") {
				const next = value;
				if ((current ?? "") !== next) {
					assign(next);
					mutated = true;
				}
			}
		};

		if (input.title !== undefined) {
			const trimmed = input.title.trim();
			if (trimmed.length === 0) {
				throw new Error("Title cannot be empty.");
			}
			if (state.title !== trimmed) {
				state.title = trimmed;
				mutated = true;
			}
		}

		applyStringField(input.description, state.description, (next) => {
			state.description = next;
		});

		if (input.status !== undefined) {
			const canonicalStatus = await statusResolver(input.status);
			if ((state.status ?? "") !== canonicalStatus) {
				state.status = canonicalStatus;
				mutated = true;
			}
		}

		if (input.priority !== undefined) {
			const normalizedPriority = this.normalizePriority(String(input.priority));
			if (state.priority !== normalizedPriority) {
				state.priority = normalizedPriority;
				mutated = true;
			}
		}

		if (input.milestone !== undefined) {
			const normalizedMilestone =
				input.milestone === null ? undefined : input.milestone.trim().length > 0 ? input.milestone.trim() : undefined;
			if ((state.milestone ?? undefined) !== normalizedMilestone) {
				if (normalizedMilestone === undefined) {
					delete state.milestone;
				} else {
					state.milestone = normalizedMilestone;
				}
				mutated = true;
			}
		}

		if (input.ordinal !== undefined) {
			if (Number.isNaN(input.ordinal) || input.ordinal < 0) {
				throw new Error("Ordinal must be a non-negative number.");
			}
			if (state.ordinal !== input.ordinal) {
				state.ordinal = input.ordinal;
				mutated = true;
			}
		}

		if (input.assignee !== undefined) {
			const sanitizedAssignee = normalizeStringList(input.assignee) ?? [];
			if (!stringArraysEqual(sanitizedAssignee, state.assignee ?? [])) {
				state.assignee = sanitizedAssignee;
				mutated = true;
			}
		}

		const resolveLabelChanges = (): void => {
			let currentLabels = [...(state.labels ?? [])];
			if (input.labels !== undefined) {
				const sanitizedLabels = normalizeStringList(input.labels) ?? [];
				if (!stringArraysEqual(sanitizedLabels, currentLabels)) {
					state.labels = sanitizedLabels;
					mutated = true;
				}
				currentLabels = sanitizedLabels;
			}

			const labelsToAdd = normalizeStringList(input.addLabels) ?? [];
			if (labelsToAdd.length > 0) {
				const labelSet = new Set(currentLabels.map((label) => label.toLowerCase()));
				for (const label of labelsToAdd) {
					if (!labelSet.has(label.toLowerCase())) {
						currentLabels.push(label);
						labelSet.add(label.toLowerCase());
						mutated = true;
					}
				}
				state.labels = currentLabels;
			}

			const labelsToRemove = normalizeStringList(input.removeLabels) ?? [];
			if (labelsToRemove.length > 0) {
				const removalSet = new Set(labelsToRemove.map((label) => label.toLowerCase()));
				const filtered = currentLabels.filter((label) => !removalSet.has(label.toLowerCase()));
				if (!stringArraysEqual(filtered, currentLabels)) {
					state.labels = filtered;
					mutated = true;
				}
			}
		};

		resolveLabelChanges();

		const resolveDependencies = async (): Promise<void> => {
			let currentDependencies = [...(state.dependencies ?? [])];

			if (input.dependencies !== undefined) {
				const normalized = normalizeDependencies(input.dependencies);
				const { valid, invalid } = await validateDependencies(normalized, this);
				if (invalid.length > 0) {
					throw new Error(
						`The following dependencies do not exist: ${invalid.join(", ")}. Please create these states first or verify the IDs.`,
					);
				}
				if (!stringArraysEqual(valid, currentDependencies)) {
					currentDependencies = valid;
					mutated = true;
				}
			}

			if (input.addDependencies && input.addDependencies.length > 0) {
				const additions = normalizeDependencies(input.addDependencies);
				const { valid, invalid } = await validateDependencies(additions, this);
				if (invalid.length > 0) {
					throw new Error(
						`The following dependencies do not exist: ${invalid.join(", ")}. Please create these states first or verify the IDs.`,
					);
				}
				const depSet = new Set(currentDependencies);
				for (const dep of valid) {
					if (!depSet.has(dep)) {
						currentDependencies.push(dep);
						depSet.add(dep);
						mutated = true;
					}
				}
			}

			if (input.removeDependencies && input.removeDependencies.length > 0) {
				const removals = new Set(normalizeDependencies(input.removeDependencies));
				const filtered = currentDependencies.filter((dep) => !removals.has(dep));
				if (!stringArraysEqual(filtered, currentDependencies)) {
					currentDependencies = filtered;
					mutated = true;
				}
			}

			state.dependencies = currentDependencies;
		};

		await resolveDependencies();

		const resolveReferences = (): void => {
			let currentReferences = [...(state.references ?? [])];
			if (input.references !== undefined) {
				const sanitizedReferences = normalizeStringList(input.references) ?? [];
				if (!stringArraysEqual(sanitizedReferences, currentReferences)) {
					state.references = sanitizedReferences;
					mutated = true;
				}
				currentReferences = sanitizedReferences;
			}

			const referencesToAdd = normalizeStringList(input.addReferences) ?? [];
			if (referencesToAdd.length > 0) {
				const refSet = new Set(currentReferences);
				for (const ref of referencesToAdd) {
					if (!refSet.has(ref)) {
						currentReferences.push(ref);
						refSet.add(ref);
						mutated = true;
					}
				}
				state.references = currentReferences;
			}

			const referencesToRemove = normalizeStringList(input.removeReferences) ?? [];
			if (referencesToRemove.length > 0) {
				const removalSet = new Set(referencesToRemove);
				const filtered = currentReferences.filter((ref) => !removalSet.has(ref));
				if (!stringArraysEqual(filtered, currentReferences)) {
					state.references = filtered;
					mutated = true;
				}
			}
		};

		resolveReferences();

		const resolveDocumentation = (): void => {
			let currentDocumentation = [...(state.documentation ?? [])];
			if (input.documentation !== undefined) {
				const sanitizedDocumentation = normalizeStringList(input.documentation) ?? [];
				if (!stringArraysEqual(sanitizedDocumentation, currentDocumentation)) {
					state.documentation = sanitizedDocumentation;
					mutated = true;
				}
				currentDocumentation = sanitizedDocumentation;
			}

			const documentationToAdd = normalizeStringList(input.addDocumentation) ?? [];
			if (documentationToAdd.length > 0) {
				const docSet = new Set(currentDocumentation);
				for (const doc of documentationToAdd) {
					if (!docSet.has(doc)) {
						currentDocumentation.push(doc);
						docSet.add(doc);
						mutated = true;
					}
				}
				state.documentation = currentDocumentation;
			}

			const documentationToRemove = normalizeStringList(input.removeDocumentation) ?? [];
			if (documentationToRemove.length > 0) {
				const removalSet = new Set(documentationToRemove);
				const filtered = currentDocumentation.filter((doc) => !removalSet.has(doc));
				if (!stringArraysEqual(filtered, currentDocumentation)) {
					state.documentation = filtered;
					mutated = true;
				}
			}
		};

		resolveDocumentation();

		const sanitizeAppendInput = (values: string[] | undefined): string[] => {
			if (!values) return [];
			return values.map((value) => String(value).trim()).filter((value) => value.length > 0);
		};

		const appendBlock = (
			existing: string | undefined,
			additions: string[] | undefined,
		): { value?: string; changed: boolean } => {
			const sanitizedAdditions = (additions ?? [])
				.map((value) => String(value).trim())
				.filter((value) => value.length > 0);
			if (sanitizedAdditions.length === 0) {
				return { value: existing, changed: false };
			}
			const current = (existing ?? "").trim();
			const additionBlock = sanitizedAdditions.join("\n\n");
			if (current.length === 0) {
				return { value: additionBlock, changed: true };
			}
			return { value: `${current}\n\n${additionBlock}`, changed: true };
		};

		if (input.clearImplementationPlan) {
			if (state.implementationPlan !== undefined) {
				delete state.implementationPlan;
				mutated = true;
			}
		}

		applyStringField(input.implementationPlan, state.implementationPlan, (next) => {
			state.implementationPlan = next;
		});

		const planAppends = sanitizeAppendInput(input.appendImplementationPlan);
		if (planAppends.length > 0) {
			const { value, changed } = appendBlock(state.implementationPlan, planAppends);
			if (changed) {
				state.implementationPlan = value;
				mutated = true;
			}
		}

		if (input.clearImplementationNotes) {
			if (state.implementationNotes !== undefined) {
				delete state.implementationNotes;
				mutated = true;
			}
		}

		applyStringField(input.implementationNotes, state.implementationNotes, (next) => {
			state.implementationNotes = next;
		});

		const notesAppends = sanitizeAppendInput(input.appendImplementationNotes);
		if (notesAppends.length > 0) {
			const { value, changed } = appendBlock(state.implementationNotes, notesAppends);
			if (changed) {
				state.implementationNotes = value;
				mutated = true;
			}
		}

		if (input.clearFinalSummary) {
			if (state.finalSummary !== undefined) {
				state.finalSummary = "";
				mutated = true;
			}
		}

		applyStringField(input.finalSummary, state.finalSummary, (next) => {
			state.finalSummary = next;
		});

		const finalSummaryAppends = sanitizeAppendInput(input.appendFinalSummary);
		if (finalSummaryAppends.length > 0) {
			const { value, changed } = appendBlock(state.finalSummary, finalSummaryAppends);
			if (changed) {
				state.finalSummary = value;
				mutated = true;
			}
		}

		let acceptanceCriteria = Array.isArray(state.acceptanceCriteriaItems)
			? state.acceptanceCriteriaItems.map((criterion) => ({ ...criterion }))
			: [];

		const rebuildIndices = () => {
			acceptanceCriteria = acceptanceCriteria.map((criterion, index) => ({
				...criterion,
				index: index + 1,
			}));
		};

		if (input.acceptanceCriteria !== undefined) {
			const sanitized = input.acceptanceCriteria
				.map((criterion) => ({
					text: String(criterion.text ?? "").trim(),
					checked: Boolean(criterion.checked),
				}))
				.filter((criterion) => criterion.text.length > 0)
				.map((criterion, index) => ({
					index: index + 1,
					text: criterion.text,
					checked: criterion.checked,
				}));
			acceptanceCriteria = sanitized;
			mutated = true;
		}

		if (input.addAcceptanceCriteria && input.addAcceptanceCriteria.length > 0) {
			const additions = input.addAcceptanceCriteria
				.map((criterion) => (typeof criterion === "string" ? criterion.trim() : String(criterion.text ?? "").trim()))
				.filter((text) => text.length > 0);
			let index =
				acceptanceCriteria.length > 0 ? Math.max(...acceptanceCriteria.map((criterion) => criterion.index)) + 1 : 1;
			for (const text of additions) {
				acceptanceCriteria.push({ index: index++, text, checked: false });
				mutated = true;
			}
		}

		if (input.removeAcceptanceCriteria && input.removeAcceptanceCriteria.length > 0) {
			const removalSet = new Set(input.removeAcceptanceCriteria);
			const beforeLength = acceptanceCriteria.length;
			acceptanceCriteria = acceptanceCriteria.filter((criterion) => !removalSet.has(criterion.index));
			if (acceptanceCriteria.length === beforeLength) {
				throw new Error(
					`Acceptance criterion ${Array.from(removalSet)
						.map((index) => `#${index}`)
						.join(", ")} not found`,
				);
			}
			mutated = true;
			rebuildIndices();
		}

		const toggleCriteria = (indices: number[] | undefined, checked: boolean) => {
			if (!indices || indices.length === 0) return;
			const missing: number[] = [];
			for (const index of indices) {
				const criterion = acceptanceCriteria.find((item) => item.index === index);
				if (!criterion) {
					missing.push(index);
					continue;
				}
				if (criterion.checked !== checked) {
					criterion.checked = checked;
					mutated = true;
				}
			}
			if (missing.length > 0) {
				const label = missing.map((index) => `#${index}`).join(", ");
				throw new Error(`Acceptance criterion ${label} not found`);
			}
		};

		toggleCriteria(input.checkAcceptanceCriteria, true);
		toggleCriteria(input.uncheckAcceptanceCriteria, false);

		state.acceptanceCriteriaItems = acceptanceCriteria;

		let definitionOfDone = Array.isArray(state.definitionOfDoneItems)
			? state.definitionOfDoneItems.map((criterion) => ({ ...criterion }))
			: [];

		const rebuildDefinitionIndices = () => {
			definitionOfDone = definitionOfDone.map((criterion, index) => ({
				...criterion,
				index: index + 1,
			}));
		};

		if (input.addDefinitionOfDone && input.addDefinitionOfDone.length > 0) {
			const additions = input.addDefinitionOfDone
				.map((criterion) => (typeof criterion === "string" ? criterion.trim() : String(criterion.text ?? "").trim()))
				.filter((text) => text.length > 0);
			let index =
				definitionOfDone.length > 0 ? Math.max(...definitionOfDone.map((criterion) => criterion.index)) + 1 : 1;
			for (const text of additions) {
				definitionOfDone.push({ index: index++, text, checked: false });
				mutated = true;
			}
		}

		const toggleDefinitionItems = (indices: number[] | undefined, checked: boolean) => {
			if (!indices || indices.length === 0) return;
			const missing: number[] = [];
			for (const index of indices) {
				const criterion = definitionOfDone.find((item) => item.index === index);
				if (!criterion) {
					missing.push(index);
					continue;
				}
				if (criterion.checked !== checked) {
					criterion.checked = checked;
					mutated = true;
				}
			}
			if (missing.length > 0) {
				const label = missing.map((index) => `#${index}`).join(", ");
				throw new Error(`Definition of Done item ${label} not found`);
			}
		};

		toggleDefinitionItems(input.checkDefinitionOfDone, true);
		toggleDefinitionItems(input.uncheckDefinitionOfDone, false);

		if (input.removeDefinitionOfDone && input.removeDefinitionOfDone.length > 0) {
			const removalSet = new Set(input.removeDefinitionOfDone);
			const beforeLength = definitionOfDone.length;
			definitionOfDone = definitionOfDone.filter((criterion) => !removalSet.has(criterion.index));
			if (definitionOfDone.length === beforeLength) {
				throw new Error(
					`Definition of Done item ${Array.from(removalSet)
						.map((index) => `#${index}`)
						.join(", ")} not found`,
				);
			}
			mutated = true;
			rebuildDefinitionIndices();
		}

		state.definitionOfDoneItems = definitionOfDone;

		return { state, mutated };
	}

	async updateStateFromInput(stateId: string, input: StateUpdateInput, autoCommit?: boolean): Promise<State> {
		const state = await this.fs.loadState(stateId);
		if (!state) {
			throw new Error(`State not found: ${stateId}`);
		}

		const requestedStatus = input.status?.trim().toLowerCase();
		if (requestedStatus === "draft") {
			return await this.demoteStateWithUpdates(state, input, autoCommit);
		}

		const { mutated } = await this.applyStateUpdateInput(state, input, async (status) =>
			this.requireCanonicalStatus(status),
		);

		if (!mutated) {
			return state;
		}

		await this.updateState(state, autoCommit);
		const refreshed = await this.fs.loadState(stateId);
		return refreshed ?? state;
	}

	async updateDraft(state: State, autoCommit?: boolean): Promise<void> {
		// Drafts always keep status Draft
		state.status = "Draft";
		normalizeAssignee(state);
		state.updatedDate = new Date().toISOString().slice(0, 16).replace("T", " ");

		const filepath = await this.fs.saveDraft(state);

		if (await this.shouldAutoCommit(autoCommit)) {
			await this.git.addFile(filepath);
			await this.git.commitStateChange(state.id, `Update draft ${state.id}`, filepath);
		}
	}

	async updateDraftFromInput(draftId: string, input: StateUpdateInput, autoCommit?: boolean): Promise<State> {
		const draft = await this.fs.loadDraft(draftId);
		if (!draft) {
			throw new Error(`Draft not found: ${draftId}`);
		}

		const { mutated } = await this.applyStateUpdateInput(draft, input, async (status) => {
			if (status.trim().toLowerCase() !== "draft") {
				throw new Error("Drafts must use status Draft.");
			}
			return "Draft";
		});

		if (!mutated) {
			return draft;
		}

		await this.updateDraft(draft, autoCommit);
		const refreshed = await this.fs.loadDraft(draftId);
		return refreshed ?? draft;
	}

	async editStateOrDraft(stateId: string, input: StateUpdateInput, autoCommit?: boolean): Promise<State> {
		const draft = await this.fs.loadDraft(stateId);
		if (draft) {
			const requestedStatus = input.status?.trim();
			const wantsDraft = requestedStatus?.toLowerCase() === "draft";
			if (requestedStatus && !wantsDraft) {
				return await this.promoteDraftWithUpdates(draft, input, autoCommit);
			}
			return await this.updateDraftFromInput(draft.id, input, autoCommit);
		}

		const state = await this.fs.loadState(stateId);
		if (!state) {
			throw new Error(`State not found: ${stateId}`);
		}

		const requestedStatus = input.status?.trim();
		const wantsDraft = requestedStatus?.toLowerCase() === "draft";
		if (wantsDraft) {
			return await this.demoteStateWithUpdates(state, input, autoCommit);
		}

		return await this.updateStateFromInput(state.id, input, autoCommit);
	}

	private async promoteDraftWithUpdates(draft: State, input: StateUpdateInput, autoCommit?: boolean): Promise<State> {
		const targetStatus = input.status?.trim();
		if (!targetStatus || targetStatus.toLowerCase() === "draft") {
			throw new Error("Promoting a draft requires a non-draft status.");
		}

		const { mutated } = await this.applyStateUpdateInput(draft, { ...input, status: undefined }, async (status) => {
			if (status.trim().toLowerCase() !== "draft") {
				throw new Error("Drafts must use status Draft.");
			}
			return "Draft";
		});

		const canonicalStatus = await this.requireCanonicalStatus(targetStatus);
		const newStateId = await this.generateNextId(EntityType.State, draft.parentStateId);
		const draftPath = draft.filePath;

		const promotedState: State = {
			...draft,
			id: newStateId,
			status: canonicalStatus,
			filePath: undefined,
			...(mutated || draft.status !== canonicalStatus
				? { updatedDate: new Date().toISOString().slice(0, 16).replace("T", " ") }
				: {}),
		};

		normalizeAssignee(promotedState);
		const savedPath = await this.fs.saveState(promotedState);

		if (draftPath) {
			await unlink(draftPath);
		}

		if (this.contentStore) {
			const savedState = await this.fs.loadState(promotedState.id);
			if (savedState) {
				this.contentStore.upsertState(savedState);
			}
		}

		if (await this.shouldAutoCommit(autoCommit)) {
			const roadmapDir = await this.getRoadmapDirectoryName();
			const repoRoot = await this.git.stageRoadmapDirectory(roadmapDir);
			await this.git.commitChanges(`roadmap: Promote draft ${normalizeId(draft.id, "draft")}`, repoRoot);
		}

		return (await this.fs.loadState(promotedState.id)) ?? { ...promotedState, filePath: savedPath };
	}

	private async demoteStateWithUpdates(state: State, input: StateUpdateInput, autoCommit?: boolean): Promise<State> {
		const { mutated } = await this.applyStateUpdateInput(state, { ...input, status: undefined }, async (status) => {
			if (status.trim().toLowerCase() === "draft") {
				return "Draft";
			}
			return this.requireCanonicalStatus(status);
		});

		const newDraftId = await this.generateNextId(EntityType.Draft);
		const statePath = state.filePath;

		const demotedDraft: State = {
			...state,
			id: newDraftId,
			status: "Draft",
			filePath: undefined,
			...(mutated || state.status !== "Draft"
				? { updatedDate: new Date().toISOString().slice(0, 16).replace("T", " ") }
				: {}),
		};

		normalizeAssignee(demotedDraft);
		const savedPath = await this.fs.saveDraft(demotedDraft);

		if (statePath) {
			await unlink(statePath);
		}

		if (await this.shouldAutoCommit(autoCommit)) {
			const roadmapDir = await this.getRoadmapDirectoryName();
			const repoRoot = await this.git.stageRoadmapDirectory(roadmapDir);
			await this.git.commitChanges(`roadmap: Demote state ${normalizeStateId(state.id)}`, repoRoot);
		}

		return (await this.fs.loadDraft(demotedDraft.id)) ?? { ...demotedDraft, filePath: savedPath };
	}

	/**
	 * Execute the onStatusChange callback if configured.
	 * Per-state callback takes precedence over global config.
	 * Failures are logged but don't block the status change.
	 */
	private async executeStatusChangeCallback(state: State, oldStatus: string, newStatus: string): Promise<void> {
		const config = await this.fs.loadConfig();

		// Per-state callback takes precedence over global config
		const callbackCommand = state.onStatusChange ?? config?.onStatusChange;
		if (!callbackCommand) {
			return;
		}

		try {
			const result = await executeStatusCallback({
				command: callbackCommand,
				stateId: state.id,
				oldStatus,
				newStatus,
				stateTitle: state.title,
				cwd: this.fs.rootDir,
			});

			if (!result.success) {
				console.error(`Status change callback failed for ${state.id}: ${result.error ?? "Unknown error"}`);
				if (result.output) {
					console.error(`Callback output: ${result.output}`);
				}
			} else if (process.env.DEBUG && result.output) {
				console.log(`Status change callback output for ${state.id}: ${result.output}`);
			}
		} catch (error) {
			console.error(`Failed to execute status change callback for ${state.id}:`, error);
		}
	}

	async editState(stateId: string, input: StateUpdateInput, autoCommit?: boolean): Promise<State> {
		return await this.updateStateFromInput(stateId, input, autoCommit);
	}

	async updateStatesBulk(states: State[], commitMessage?: string, autoCommit?: boolean): Promise<void> {
		// Update all states without committing individually
		for (const state of states) {
			await this.updateState(state, false); // Don't auto-commit each one
		}

		// Commit all changes at once if auto-commit is enabled
		if (await this.shouldAutoCommit(autoCommit)) {
			const roadmapDir = await this.getRoadmapDirectoryName();
			const repoRoot = await this.git.stageRoadmapDirectory(roadmapDir);
			await this.git.commitChanges(commitMessage || `Update ${states.length} states`, repoRoot);
		}
	}

	async reorderState(params: {
		stateId: string;
		targetStatus: string;
		orderedStateIds: string[];
		targetMilestone?: string | null;
		commitMessage?: string;
		autoCommit?: boolean;
		defaultStep?: number;
	}): Promise<{ updatedState: State; changedStates: State[] }> {
		const stateId = normalizeStateId(String(params.stateId || "").trim());
		const targetStatus = String(params.targetStatus || "").trim();
		const orderedStateIds = params.orderedStateIds.map((id) => normalizeStateId(String(id || "").trim())).filter(Boolean);
		const defaultStep = params.defaultStep ?? DEFAULT_ORDINAL_STEP;

		if (!stateId) throw new Error("stateId is required");
		if (!targetStatus) throw new Error("targetStatus is required");
		if (orderedStateIds.length === 0) throw new Error("orderedStateIds must include at least one state");
		if (!orderedStateIds.includes(stateId)) {
			throw new Error("orderedStateIds must include the state being moved");
		}

		const seen = new Set<string>();
		for (const id of orderedStateIds) {
			if (seen.has(id)) {
				throw new Error(`Duplicate state id ${id} in orderedStateIds`);
			}
			seen.add(id);
		}

		// Load all states from the ordered list - use getState to include cross-branch states from the store
		const loadedStates = await Promise.all(
			orderedStateIds.map(async (id) => {
				const state = await this.getState(id);
				return state;
			}),
		);

		// Filter out any states that couldn't be loaded (may have been moved/deleted)
		const validStates = loadedStates.filter((t): t is State => t !== null);

		// Verify the moved state itself exists
		const movedState = validStates.find((t) => t.id === stateId);
		if (!movedState) {
			throw new Error(`State ${stateId} not found while reordering`);
		}

		// Reject reordering states from other branches - they can only be modified in their source branch
		if (movedState.branch) {
			throw new Error(
				`State ${stateId} exists in branch "${movedState.branch}" and cannot be reordered from the current branch. Switch to that branch to modify it.`,
			);
		}

		const hasTargetMilestone = params.targetMilestone !== undefined;
		const normalizedTargetMilestone =
			params.targetMilestone === null
				? undefined
				: typeof params.targetMilestone === "string" && params.targetMilestone.trim().length > 0
					? params.targetMilestone.trim()
					: undefined;

		// Calculate target index within the valid states list
		const validOrderedIds = orderedStateIds.filter((id) => validStates.some((t) => t.id === id));
		const targetIndex = validOrderedIds.indexOf(stateId);

		if (targetIndex === -1) {
			throw new Error("Implementation error: State found in validStates but index missing");
		}

		const previousState = targetIndex > 0 ? validStates[targetIndex - 1] : null;
		const nextState = targetIndex < validStates.length - 1 ? validStates[targetIndex + 1] : null;

		const { ordinal: newOrdinal, requiresRebalance } = calculateNewOrdinal({
			previous: previousState,
			next: nextState,
			defaultStep,
		});

		const updatedMoved: State = {
			...movedState,
			status: targetStatus,
			...(hasTargetMilestone ? { milestone: normalizedTargetMilestone } : {}),
			ordinal: newOrdinal,
		};

		const statesInOrder: State[] = validStates.map((state, index) => (index === targetIndex ? updatedMoved : state));
		const resolutionUpdates = resolveOrdinalConflicts(statesInOrder, {
			defaultStep,
			startOrdinal: defaultStep,
			forceSequential: requiresRebalance,
		});

		const updatesMap = new Map<string, State>();
		for (const update of resolutionUpdates) {
			updatesMap.set(update.id, update);
		}
		if (!updatesMap.has(updatedMoved.id)) {
			updatesMap.set(updatedMoved.id, updatedMoved);
		}

		const originalMap = new Map(validStates.map((state) => [state.id, state]));
		const changedStates = Array.from(updatesMap.values()).filter((state) => {
			const original = originalMap.get(state.id);
			if (!original) return true;
			return (
				(original.ordinal ?? null) !== (state.ordinal ?? null) ||
				(original.status ?? "") !== (state.status ?? "") ||
				(original.milestone ?? "") !== (state.milestone ?? "")
			);
		});

		if (changedStates.length > 0) {
			await this.updateStatesBulk(
				changedStates,
				params.commitMessage ?? `Reorder states in ${targetStatus}`,
				params.autoCommit,
			);
		}

		const updatedState = updatesMap.get(stateId) ?? updatedMoved;
		return { updatedState, changedStates };
	}

	// Sequences operations (business logic lives in core, not server)
	async listActiveSequences(): Promise<{ unsequenced: State[]; sequences: Sequence[] }> {
		const all = await this.fs.listStates();
		const active = all.filter((t) => (t.status || "").toLowerCase() !== "done");
		return computeSequences(active);
	}

	async moveStateInSequences(params: {
		stateId: string;
		unsequenced?: boolean;
		targetSequenceIndex?: number;
	}): Promise<{ unsequenced: State[]; sequences: Sequence[] }> {
		const stateId = String(params.stateId || "").trim();
		if (!stateId) throw new Error("stateId is required");

		const allStates = await this.fs.listStates();
		const exists = allStates.some((t) => t.id === stateId);
		if (!exists) throw new Error(`State ${stateId} not found`);

		const active = allStates.filter((t) => (t.status || "").toLowerCase() !== "done");
		const { sequences } = computeSequences(active);

		if (params.unsequenced) {
			const res = planMoveToUnsequenced(allStates, stateId);
			if (!res.ok) throw new Error(res.error);
			await this.updateStatesBulk(res.changed, `Move ${stateId} to Unsequenced`);
		} else {
			const targetSequenceIndex = params.targetSequenceIndex;
			if (targetSequenceIndex === undefined || Number.isNaN(targetSequenceIndex)) {
				throw new Error("targetSequenceIndex must be a number");
			}
			if (targetSequenceIndex < 1) throw new Error("targetSequenceIndex must be >= 1");
			const changed = planMoveToSequence(allStates, sequences, stateId, targetSequenceIndex);
			if (changed.length > 0) await this.updateStatesBulk(changed, `Update deps/order for ${stateId}`);
		}

		// Return updated sequences
		const afterAll = await this.fs.listStates();
		const afterActive = afterAll.filter((t) => (t.status || "").toLowerCase() !== "done");
		return computeSequences(afterActive);
	}

	async archiveState(stateId: string, autoCommit?: boolean): Promise<boolean> {
		const stateToArchive = await this.fs.loadState(stateId);
		if (!stateToArchive) {
			return false;
		}
		const normalizedStateId = stateToArchive.id;

		// Get paths before moving the file
		const statePath = stateToArchive.filePath ?? (await getStatePath(normalizedStateId, this));
		const stateFilename = await getStateFilename(normalizedStateId, this);

		if (!statePath || !stateFilename) return false;

		const fromPath = statePath;
		const toPath = join(await this.fs.getArchiveStatesDir(), stateFilename);

		const success = await this.fs.archiveState(normalizedStateId);
		if (!success) {
			return false;
		}

		const activeStates = await this.fs.listStates();
		const sanitizedStates = this.sanitizeArchivedStateLinks(activeStates, normalizedStateId);
		if (sanitizedStates.length > 0) {
			await this.updateStatesBulk(sanitizedStates, undefined, false);
		}

		if (await this.shouldAutoCommit(autoCommit)) {
			// Stage the file move for proper Git tracking
			const repoRoot = await this.git.stageFileMove(fromPath, toPath);
			for (const sanitizedState of sanitizedStates) {
				if (sanitizedState.filePath) {
					await this.git.addFile(sanitizedState.filePath);
				}
			}
			await this.git.commitChanges(`roadmap: Archive state ${normalizedStateId}`, repoRoot);
		}

		return true;
	}

	async archiveMilestone(
		identifier: string,
		autoCommit?: boolean,
	): Promise<{ success: boolean; sourcePath?: string; targetPath?: string; milestone?: Milestone }> {
		const result = await this.fs.archiveMilestone(identifier);

		if (result.success && result.sourcePath && result.targetPath && (await this.shouldAutoCommit(autoCommit))) {
			const repoRoot = await this.git.stageFileMove(result.sourcePath, result.targetPath);
			const label = result.milestone?.id ? ` ${result.milestone.id}` : "";
			const commitPaths = [result.sourcePath, result.targetPath];
			try {
				await this.git.commitFiles(`roadmap: Archive milestone${label}`, commitPaths, repoRoot);
			} catch (error) {
				await this.git.resetPaths(commitPaths, repoRoot);
				try {
					await moveFile(result.targetPath, result.sourcePath);
				} catch {
					// Ignore rollback failure and propagate original commit error.
				}
				throw error;
			}
		}

		return {
			success: result.success,
			sourcePath: result.sourcePath,
			targetPath: result.targetPath,
			milestone: result.milestone,
		};
	}

	async renameMilestone(
		identifier: string,
		title: string,
		autoCommit?: boolean,
	): Promise<{
		success: boolean;
		sourcePath?: string;
		targetPath?: string;
		milestone?: Milestone;
		previousTitle?: string;
	}> {
		const result = await this.fs.renameMilestone(identifier, title);
		if (!result.success) {
			return result;
		}

		if (result.sourcePath && result.targetPath && (await this.shouldAutoCommit(autoCommit))) {
			const repoRoot = await this.git.stageFileMove(result.sourcePath, result.targetPath);
			const label = result.milestone?.id ? ` ${result.milestone.id}` : "";
			const commitPaths = [result.sourcePath, result.targetPath];
			try {
				await this.git.commitFiles(`roadmap: Rename milestone${label}`, commitPaths, repoRoot);
			} catch (error) {
				await this.git.resetPaths(commitPaths, repoRoot);
				const rollbackTitle = result.previousTitle ?? title;
				await this.fs.renameMilestone(result.milestone?.id ?? identifier, rollbackTitle);
				throw error;
			}
		}

		return result;
	}

	async completeState(stateId: string, autoCommit?: boolean): Promise<boolean> {
		// Get paths before moving the file
		const completedDir = this.fs.completedDir;
		const statePath = await getStatePath(stateId, this);
		const stateFilename = await getStateFilename(stateId, this);

		if (!statePath || !stateFilename) return false;

		const fromPath = statePath;
		const toPath = join(completedDir, stateFilename);

		const success = await this.fs.completeState(stateId);

		if (success && (await this.shouldAutoCommit(autoCommit))) {
			// Stage the file move for proper Git tracking
			const repoRoot = await this.git.stageFileMove(fromPath, toPath);
			await this.git.commitChanges(`roadmap: Complete state ${normalizeStateId(stateId)}`, repoRoot);
		}

		return success;
	}

	async getDoneStatesByAge(olderThanDays: number): Promise<State[]> {
		const states = await this.fs.listStates();
		const cutoffDate = new Date();
		cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

		return states.filter((state) => {
			if (state.status !== "Done") return false;

			// Check updatedDate first, then createdDate as fallback
			const stateDate = state.updatedDate || state.createdDate;
			if (!stateDate) return false;

			const date = new Date(stateDate);
			return date < cutoffDate;
		});
	}

	async archiveDraft(draftId: string, autoCommit?: boolean): Promise<boolean> {
		const success = await this.fs.archiveDraft(draftId);

		if (success && (await this.shouldAutoCommit(autoCommit))) {
			const roadmapDir = await this.getRoadmapDirectoryName();
			const repoRoot = await this.git.stageRoadmapDirectory(roadmapDir);
			await this.git.commitChanges(`roadmap: Archive draft ${normalizeId(draftId, "draft")}`, repoRoot);
		}

		return success;
	}

	async promoteDraft(draftId: string, autoCommit?: boolean): Promise<boolean> {
		const success = await this.fs.promoteDraft(draftId);

		if (success && (await this.shouldAutoCommit(autoCommit))) {
			const roadmapDir = await this.getRoadmapDirectoryName();
			const repoRoot = await this.git.stageRoadmapDirectory(roadmapDir);
			await this.git.commitChanges(`roadmap: Promote draft ${normalizeId(draftId, "draft")}`, repoRoot);
		}

		return success;
	}

	async demoteState(stateId: string, autoCommit?: boolean): Promise<boolean> {
		const success = await this.fs.demoteState(stateId);

		if (success && (await this.shouldAutoCommit(autoCommit))) {
			const roadmapDir = await this.getRoadmapDirectoryName();
			const repoRoot = await this.git.stageRoadmapDirectory(roadmapDir);
			await this.git.commitChanges(`roadmap: Demote state ${normalizeStateId(stateId)}`, repoRoot);
		}

		return success;
	}

	/**
	 * Add acceptance criteria to a state
	 */
	async addAcceptanceCriteria(stateId: string, criteria: string[], autoCommit?: boolean): Promise<void> {
		const state = await this.fs.loadState(stateId);
		if (!state) {
			throw new Error(`State not found: ${stateId}`);
		}

		// Get existing criteria or initialize empty array
		const current = Array.isArray(state.acceptanceCriteriaItems) ? [...state.acceptanceCriteriaItems] : [];

		// Calculate next index (1-based)
		let nextIndex = current.length > 0 ? Math.max(...current.map((c) => c.index)) + 1 : 1;

		// Append new criteria
		const newCriteria = criteria.map((text) => ({ index: nextIndex++, text, checked: false }));
		state.acceptanceCriteriaItems = [...current, ...newCriteria];

		// Save the state
		await this.updateState(state, autoCommit);
	}

	/**
	 * Remove acceptance criteria by indices (supports batch operations)
	 * @returns Array of removed indices
	 */
	async removeAcceptanceCriteria(stateId: string, indices: number[], autoCommit?: boolean): Promise<number[]> {
		const state = await this.fs.loadState(stateId);
		if (!state) {
			throw new Error(`State not found: ${stateId}`);
		}

		let list = Array.isArray(state.acceptanceCriteriaItems) ? [...state.acceptanceCriteriaItems] : [];
		const removed: number[] = [];

		// Sort indices in descending order to avoid index shifting issues
		const sortedIndices = [...indices].sort((a, b) => b - a);

		for (const idx of sortedIndices) {
			const before = list.length;
			list = list.filter((c) => c.index !== idx);
			if (list.length < before) {
				removed.push(idx);
			}
		}

		if (removed.length === 0) {
			throw new Error("No criteria were removed. Check that the specified indices exist.");
		}

		// Re-index remaining items (1-based)
		list = list.map((c, i) => ({ ...c, index: i + 1 }));
		state.acceptanceCriteriaItems = list;

		// Save the state
		await this.updateState(state, autoCommit);

		return removed.sort((a, b) => a - b); // Return in ascending order
	}

	/**
	 * Check or uncheck acceptance criteria by indices (supports batch operations)
	 * Silently ignores invalid indices and only updates valid ones.
	 * @returns Array of updated indices
	 */
	async checkAcceptanceCriteria(
		stateId: string,
		indices: number[],
		checked: boolean,
		autoCommit?: boolean,
	): Promise<number[]> {
		const state = await this.fs.loadState(stateId);
		if (!state) {
			throw new Error(`State not found: ${stateId}`);
		}

		let list = Array.isArray(state.acceptanceCriteriaItems) ? [...state.acceptanceCriteriaItems] : [];
		const updated: number[] = [];

		// Filter to only valid indices and update them
		for (const idx of indices) {
			if (list.some((c) => c.index === idx)) {
				list = list.map((c) => {
					if (c.index === idx) {
						updated.push(idx);
						return { ...c, checked };
					}
					return c;
				});
			}
		}

		if (updated.length === 0) {
			throw new Error("No criteria were updated.");
		}

		state.acceptanceCriteriaItems = list;

		// Save the state
		await this.updateState(state, autoCommit);

		return updated.sort((a, b) => a - b);
	}

	/**
	 * List all acceptance criteria for a state
	 */
	async listAcceptanceCriteria(stateId: string): Promise<AcceptanceCriterion[]> {
		const state = await this.fs.loadState(stateId);
		if (!state) {
			throw new Error(`State not found: ${stateId}`);
		}

		return state.acceptanceCriteriaItems || [];
	}

	async createDecision(decision: Decision, autoCommit?: boolean): Promise<void> {
		await this.fs.saveDecision(decision);

		if (await this.shouldAutoCommit(autoCommit)) {
			const roadmapDir = await this.getRoadmapDirectoryName();
			const repoRoot = await this.git.stageRoadmapDirectory(roadmapDir);
			await this.git.commitChanges(`roadmap: Add decision ${decision.id}`, repoRoot);
		}
	}

	async updateDecisionFromContent(decisionId: string, content: string, autoCommit?: boolean): Promise<void> {
		const existingDecision = await this.fs.loadDecision(decisionId);
		if (!existingDecision) {
			throw new Error(`Decision ${decisionId} not found`);
		}

		// Parse the markdown content to extract the decision data
		const matter = await import("gray-matter");
		const { data } = matter.default(content);

		const extractSection = (content: string, sectionName: string): string | undefined => {
			const regex = new RegExp(`## ${sectionName}\\s*([\\s\\S]*?)(?=## |$)`, "i");
			const match = content.match(regex);
			return match ? match[1]?.trim() : undefined;
		};

		const updatedDecision = {
			...existingDecision,
			title: data.title || existingDecision.title,
			status: data.status || existingDecision.status,
			date: data.date || existingDecision.date,
			context: extractSection(content, "Context") || existingDecision.context,
			decision: extractSection(content, "Decision") || existingDecision.decision,
			consequences: extractSection(content, "Consequences") || existingDecision.consequences,
			alternatives: extractSection(content, "Alternatives") || existingDecision.alternatives,
		};

		await this.createDecision(updatedDecision, autoCommit);
	}

	async createDecisionWithTitle(title: string, autoCommit?: boolean): Promise<Decision> {
		// Import the generateNextDecisionId function from CLI
		const { generateNextDecisionId } = await import("../cli.js");
		const id = await generateNextDecisionId(this);

		const decision: Decision = {
			id,
			title,
			date: new Date().toISOString().slice(0, 16).replace("T", " "),
			status: "proposed",
			context: "[Describe the context and problem that needs to be addressed]",
			decision: "[Describe the decision that was made]",
			consequences: "[Describe the consequences of this decision]",
			rawContent: "",
		};

		await this.createDecision(decision, autoCommit);
		return decision;
	}

	async createDocument(doc: Document, autoCommit?: boolean, subPath = ""): Promise<void> {
		const relativePath = await this.fs.saveDocument(doc, subPath);
		doc.path = relativePath;

		if (await this.shouldAutoCommit(autoCommit)) {
			const roadmapDir = await this.getRoadmapDirectoryName();
			const repoRoot = await this.git.stageRoadmapDirectory(roadmapDir);
			await this.git.commitChanges(`roadmap: Add document ${doc.id}`, repoRoot);
		}
	}

	async updateDocument(existingDoc: Document, content: string, autoCommit?: boolean): Promise<void> {
		const updatedDoc = {
			...existingDoc,
			rawContent: content,
			updatedDate: new Date().toISOString().slice(0, 16).replace("T", " "),
		};

		let normalizedSubPath = "";
		if (existingDoc.path) {
			const segments = existingDoc.path.split(/[\\/]/).slice(0, -1);
			if (segments.length > 0) {
				normalizedSubPath = segments.join("/");
			}
		}

		await this.createDocument(updatedDoc, autoCommit, normalizedSubPath);
	}

	async createDocumentWithId(title: string, content: string, autoCommit?: boolean): Promise<Document> {
		// Import the generateNextDocId function from CLI
		const { generateNextDocId } = await import("../cli.js");
		const id = await generateNextDocId(this);

		const document: Document = {
			id,
			title,
			type: "other" as const,
			createdDate: new Date().toISOString().slice(0, 16).replace("T", " "),
			rawContent: content,
		};

		await this.createDocument(document, autoCommit);
		return document;
	}

	async initializeProject(projectName: string, autoCommit = false): Promise<void> {
		await this.fs.ensureRoadmapStructure();

		const config: RoadmapConfig = {
			projectName: projectName,
			statuses: [...DEFAULT_STATUSES],
			labels: [],
			defaultStatus: DEFAULT_STATUSES[0], // Use first status as default
			dateFormat: "yyyy-mm-dd",
			maxColumnWidth: 20, // Default for terminal display
			autoCommit: false, // Default to false for user control
			prefixes: {
				state: "state",
			},
		};

		await this.fs.saveConfig(config);
		// Update git operations with the new config
		await this.ensureConfigLoaded();

		if (autoCommit) {
			const roadmapDir = await this.getRoadmapDirectoryName();
			const repoRoot = await this.git.stageRoadmapDirectory(roadmapDir);
			await this.git.commitChanges(`roadmap: Initialize roadmap project: ${projectName}`, repoRoot);
		}
	}

	async listStatesWithMetadata(
		includeBranchMeta = false,
	): Promise<Array<State & { lastModified?: Date; branch?: string }>> {
		const states = await this.fs.listStates();
		return await Promise.all(
			states.map(async (state) => {
				const filePath = await getStatePath(state.id, this);

				if (filePath) {
					const bunFile = Bun.file(filePath);
					const stats = await bunFile.stat();
					return {
						...state,
						lastModified: new Date(stats.mtime),
						// Only include branch if explicitly requested
						...(includeBranchMeta && {
							branch: (await this.git.getFileLastModifiedBranch(filePath)) || undefined,
						}),
					};
				}
				return state;
			}),
		);
	}

	/**
	 * Open a file in the configured editor with minimal interference
	 * @param filePath - Path to the file to edit
	 * @param screen - Optional blessed screen to suspend (for TUI contexts)
	 */
	async editStateInTui(stateId: string, screen: BlessedScreen, selectedState?: State): Promise<TuiStateEditResult> {
		const contextualState = selectedState && stateIdsEqual(selectedState.id, stateId) ? selectedState : undefined;

		if (contextualState && (!isLocalEditableState(contextualState) || contextualState.branch)) {
			return { changed: false, state: contextualState, reason: "read_only" };
		}

		const resolvedState = contextualState ?? (await this.getState(stateId));
		if (!resolvedState) {
			return { changed: false, reason: "not_found" };
		}
		if (!isLocalEditableState(resolvedState) || resolvedState.branch) {
			return { changed: false, state: resolvedState, reason: "read_only" };
		}

		const localState = await this.fs.loadState(resolvedState.id);
		const editableState = localState ?? resolvedState;

		const filePath = await getStatePath(editableState.id, this);
		if (!filePath) {
			return { changed: false, state: editableState, reason: "not_found" };
		}

		let beforeContent: string;
		try {
			beforeContent = await Bun.file(filePath).text();
		} catch {
			return { changed: false, state: editableState, reason: "not_found" };
		}

		const opened = await this.openEditor(filePath, screen);
		if (!opened) {
			return { changed: false, state: editableState, reason: "editor_failed" };
		}

		let afterContent: string;
		try {
			afterContent = await Bun.file(filePath).text();
		} catch {
			return { changed: false, state: editableState, reason: "not_found" };
		}

		if (afterContent === beforeContent) {
			const refreshedState = await this.fs.loadState(editableState.id);
			return { changed: false, state: refreshedState ?? editableState };
		}

		const now = new Date().toISOString().slice(0, 16).replace("T", " ");
		const withUpdatedDate = upsertStateUpdatedDate(afterContent, now);
		await Bun.write(filePath, withUpdatedDate);

		const refreshedState = await this.fs.loadState(editableState.id);
		if (refreshedState && this.contentStore) {
			this.contentStore.upsertState(refreshedState);
		}

		return {
			changed: true,
			state: refreshedState ?? { ...editableState, updatedDate: now },
		};
	}

	async openEditor(filePath: string, screen?: BlessedScreen): Promise<boolean> {
		const config = await this.fs.loadConfig();

		// If no screen provided, use simple editor opening
		if (!screen) {
			return await openInEditor(filePath, config);
		}

		const program = screen.program;

		// Leave alternate screen buffer FIRST
		screen.leave();

		// Reset keypad/cursor mode using terminfo if available
		if (typeof program.put?.keypad_local === "function") {
			program.put.keypad_local();
			if (typeof program.flush === "function") {
				program.flush();
			}
		}

		// Send escape sequences directly as reinforcement
		// ESC[0m   = Reset all SGR attributes (fixes white background in nano)
		// ESC[?25h = Show cursor (ensure cursor is visible)
		// ESC[?1l  = Reset DECCKM (cursor keys send CSI sequences)
		// ESC>     = DECKPNM (numeric keypad mode)
		const fs = await import("node:fs");
		fs.writeSync(1, "\u001b[0m\u001b[?25h\u001b[?1l\u001b>");

		// Pause the terminal AFTER leaving alt buffer (disables raw mode, releases terminal)
		const resume = typeof program.pause === "function" ? program.pause() : undefined;
		try {
			return await openInEditor(filePath, config);
		} finally {
			// Resume terminal state FIRST (re-enables raw mode)
			if (typeof resume === "function") {
				resume();
			}
			// Re-enter alternate screen buffer
			screen.enter();
			// Restore application cursor mode
			if (typeof program.put?.keypad_xmit === "function") {
				program.put.keypad_xmit();
				if (typeof program.flush === "function") {
					program.flush();
				}
			}
			// Full redraw
			screen.render();
		}
	}

	/**
	 * Load and process all states with the same logic as CLI overview
	 * This method extracts the common state loading logic for reuse
	 */
	async loadAllStatesForStatistics(
		progressCallback?: (msg: string) => void,
	): Promise<{ states: State[]; drafts: State[]; statuses: string[] }> {
		const config = await this.fs.loadConfig();
		const statuses = (config?.statuses || DEFAULT_STATUSES) as string[];
		const resolutionStrategy = config?.stateResolutionStrategy || "most_progressed";

		// Load local and completed states first
		progressCallback?.("Loading local states...");
		const [localStates, completedStates] = await Promise.all([
			this.listStatesWithMetadata(),
			this.fs.listCompletedStates(),
		]);

		// Load remote states and local branch states in parallel
		const branchStateEntries: BranchStateStateEntry[] | undefined =
			config?.checkActiveBranches === false ? undefined : [];
		const [remoteStates, localBranchStates] = await Promise.all([
			loadRemoteStates(this.git, config, progressCallback, localStates, branchStateEntries),
			loadLocalBranchStates(this.git, config, progressCallback, localStates, branchStateEntries),
		]);
		progressCallback?.("Loaded states");

		// Create map with local states
		const statesById = new Map<string, State>(localStates.map((t) => [t.id, { ...t, source: "local" }]));

		// Add completed states to the map
		for (const completedState of completedStates) {
			if (!statesById.has(completedState.id)) {
				statesById.set(completedState.id, { ...completedState, source: "completed" });
			}
		}

		// Merge states from other local branches
		progressCallback?.("Merging states...");
		for (const branchState of localBranchStates) {
			const existing = statesById.get(branchState.id);
			if (!existing) {
				statesById.set(branchState.id, branchState);
			} else {
				const resolved = resolveStateConflict(existing, branchState, statuses, resolutionStrategy);
				statesById.set(branchState.id, resolved);
			}
		}

		// Merge remote states with local states
		for (const remoteState of remoteStates) {
			const existing = statesById.get(remoteState.id);
			if (!existing) {
				statesById.set(remoteState.id, remoteState);
			} else {
				const resolved = resolveStateConflict(existing, remoteState, statuses, resolutionStrategy);
				statesById.set(remoteState.id, resolved);
			}
		}

		// Get all states as array
		const states = Array.from(statesById.values());
		let activeStates: State[];

		if (config?.checkActiveBranches === false) {
			activeStates = states;
		} else {
			progressCallback?.("Applying latest state states from branch scans...");
			activeStates = filterStatesByStateSnapshots(states, buildLatestStateMap(branchStateEntries || [], localStates));
		}

		// Load drafts
		progressCallback?.("Loading drafts...");
		const drafts = await this.fs.listDrafts();

		return { states: activeStates, drafts, statuses: statuses as string[] };
	}

	/**
	 * Load all states with cross-branch support
	 * This is the single entry point for loading states across all interfaces
	 */
	async loadStates(
		progressCallback?: (msg: string) => void,
		abortSignal?: AbortSignal,
		options?: { includeCompleted?: boolean },
	): Promise<State[]> {
		const config = await this.fs.loadConfig();
		const statuses = config?.statuses || [...DEFAULT_STATUSES];
		const resolutionStrategy = config?.stateResolutionStrategy || "most_progressed";
		const includeCompleted = options?.includeCompleted ?? false;

		// Check for cancellation
		if (abortSignal?.aborted) {
			throw new Error("Loading cancelled");
		}

		// Load local filesystem states first (needed for optimization)
		const [localStates, completedStates] = await Promise.all([
			this.listStatesWithMetadata(),
			includeCompleted ? this.fs.listCompletedStates() : Promise.resolve([]),
		]);

		// Check for cancellation
		if (abortSignal?.aborted) {
			throw new Error("Loading cancelled");
		}

		// Load states from remote branches and other local branches in parallel
		progressCallback?.(getStateLoadingMessage(config));

		const branchStateEntries: BranchStateStateEntry[] | undefined =
			config?.checkActiveBranches === false ? undefined : [];
		const [remoteStates, localBranchStates] = await Promise.all([
			loadRemoteStates(this.git, config, progressCallback, localStates, branchStateEntries, includeCompleted),
			loadLocalBranchStates(this.git, config, progressCallback, localStates, branchStateEntries, includeCompleted),
		]);

		// Check for cancellation after loading
		if (abortSignal?.aborted) {
			throw new Error("Loading cancelled");
		}

		// Create map with local states (current branch filesystem)
		const statesById = new Map<string, State>(localStates.map((t) => [t.id, { ...t, source: "local" }]));

		// Add local completed states when requested
		if (includeCompleted) {
			for (const completedState of completedStates) {
				statesById.set(completedState.id, { ...completedState, source: "completed" });
			}
		}

		// Merge states from other local branches
		for (const branchState of localBranchStates) {
			if (abortSignal?.aborted) {
				throw new Error("Loading cancelled");
			}

			const existing = statesById.get(branchState.id);
			if (!existing) {
				statesById.set(branchState.id, branchState);
			} else {
				const resolved = resolveStateConflict(existing, branchState, statuses, resolutionStrategy);
				statesById.set(branchState.id, resolved);
			}
		}

		// Merge remote states with local states
		for (const remoteState of remoteStates) {
			// Check for cancellation during merge
			if (abortSignal?.aborted) {
				throw new Error("Loading cancelled");
			}

			const existing = statesById.get(remoteState.id);
			if (!existing) {
				statesById.set(remoteState.id, remoteState);
			} else {
				const resolved = resolveStateConflict(existing, remoteState, statuses, resolutionStrategy);
				statesById.set(remoteState.id, resolved);
			}
		}

		// Check for cancellation before cross-branch checking
		if (abortSignal?.aborted) {
			throw new Error("Loading cancelled");
		}

		// Get the latest directory location of each state across all branches
		const states = Array.from(statesById.values());

		if (abortSignal?.aborted) {
			throw new Error("Loading cancelled");
		}

		let filteredStates: State[];

		if (config?.checkActiveBranches === false) {
			filteredStates = states;
		} else {
			progressCallback?.("Applying latest state states from branch scans...");
			if (!includeCompleted) {
				filteredStates = filterStatesByStateSnapshots(states, buildLatestStateMap(branchStateEntries || [], localStates));
			} else {
				const stateEntries = branchStateEntries || [];
				for (const completedState of completedStates) {
					if (!completedState.id) continue;
					const lastModified = completedState.updatedDate ? new Date(completedState.updatedDate) : new Date(0);
					stateEntries.push({
						id: completedState.id,
						type: "completed",
						branch: "local",
						path: "",
						lastModified,
					});
				}

				const latestState = buildLatestStateMap(stateEntries, localStates);
				const completedIds = new Set<string>();
				for (const [id, entry] of latestState) {
					if (entry.type === "completed") {
						completedIds.add(id);
					}
				}

				filteredStates = states
					.filter((state) => {
						const latest = latestState.get(state.id);
						if (!latest) return true;
						return latest.type === "state" || latest.type === "completed";
					})
					.map((state) => {
						if (!completedIds.has(state.id)) {
							return state;
						}
						return { ...state, source: "completed" };
					});
			}
		}

		return filteredStates;
	}

	/**
	 * Send a message to a communication channel
	 */
	async sendMessage(params: {
		from: string;
		message: string;
		type: "public" | "group" | "private";
		to?: string;
		group?: string;
	}): Promise<string> {
		const { from, message, type, to, group } = params;
		
		// Find the true project root (handling worktrees)
		let sharedRoadmapDir = join(this.filesystem.projectRoot, "roadmap");
		try {
			const { $ } = require("bun");
			const gitRoot = (await $`git rev-parse --show-toplevel`.quiet().text()).trim();
			if (gitRoot) {
				sharedRoadmapDir = join(gitRoot, "roadmap");
			}
		} catch {
			// Fallback to local project root
		}

		const messagesDir = join(sharedRoadmapDir, "messages");
		
		// Ensure the directory exists
		const fs = require("node:fs");
		if (!fs.existsSync(messagesDir)) {
			fs.mkdirSync(messagesDir, { recursive: true });
		}

		let fileName = "PUBLIC.md";
		let channelName = "Public Announcement";

		if (type === "group" && group) {
			fileName = `group-${group.toLowerCase().replace(/[^a-z0-9]/g, "-")}.md`;
			channelName = `Group Chat: #${group}`;
		} else if (type === "private" && to) {
			const fromName = from.replace("@", "").toLowerCase();
			const toName = to.replace("@", "").toLowerCase();
			const agents = [fromName, toName].sort();
			fileName = `private-${agents[0]}-${agents[1]}.md`;
			channelName = `Private DM: ${from} <-> ${to}`;
		}

		const filePath = join(messagesDir, fileName);
		const timestamp = new Date().toISOString().replace("T", " ").slice(0, 19);
		const logEntry = `[${timestamp}] ${from}: ${message}\n`;

		// Check if file exists, if not add header
		let content = "";
		if (fs.existsSync(filePath)) {
			content = fs.readFileSync(filePath, "utf-8");
		} else {
			content = `# ${channelName}\n\n`;
		}
		
		content += logEntry;
		fs.writeFileSync(filePath, content);

		// Commit if auto-commit is enabled
		await this.ensureConfigLoaded();
		if (this.config?.autoCommit) {
			await this.gitOps.addFiles([filePath]);
			await this.gitOps.commitChanges(`${from} sent a message to ${channelName}`);
		}

		return filePath;
	}
}
