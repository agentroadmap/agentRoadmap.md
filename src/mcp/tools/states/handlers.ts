import { basename, join } from "node:path";
import {
	isLocalEditableState,
	type Milestone,
	type SearchPriorityFilter,
	type State,
	type StateListFilter,
} from "../../../types/index.ts";
import type { StateEditArgs, StateEditRequest } from "../../../types/state-edit-args.ts";
import {
	createMilestoneFilterValueResolver,
	normalizeMilestoneFilterValue,
	resolveClosestMilestoneFilterValue,
} from "../../../utils/milestone-filter.ts";
import { buildStateUpdateInput } from "../../../utils/state-edit-builder.ts";
import { createStateSearchIndex } from "../../../utils/state-search.ts";
import { sortStates } from "../../../utils/state-sorting.ts";
import { McpError } from "../../errors/mcp-errors.ts";
import type { McpServer } from "../../server.ts";
import type { CallToolResult } from "../../types.ts";
import { milestoneKey } from "../../utils/milestone-resolution.ts";
import { formatStateCallResult } from "../../utils/state-response.ts";

export type StateCreateArgs = {
	title: string;
	description?: string;
	labels?: string[];
	assignee?: string[];
	priority?: "high" | "medium" | "low";
	status?: string;
	milestone?: string;
	parentStateId?: string;
	acceptanceCriteria?: string[];
	definitionOfDoneAdd?: string[];
	disableDefinitionOfDoneDefaults?: boolean;
	dependencies?: string[];
	references?: string[];
	documentation?: string[];
	finalSummary?: string;
};

export type StateListArgs = {
	status?: string;
	assignee?: string;
	milestone?: string;
	labels?: string[];
	search?: string;
	limit?: number;
};

export type StateSearchArgs = {
	query: string;
	status?: string;
	priority?: SearchPriorityFilter;
	limit?: number;
};

export class StateHandlers {
	constructor(private readonly core: McpServer) {}

	private async resolveMilestoneInput(milestone: string): Promise<string> {
		const [activeMilestones, archivedMilestones] = await Promise.all([
			this.core.filesystem.listMilestones(),
			this.core.filesystem.listArchivedMilestones(),
		]);
		const normalized = milestone.trim();
		const inputKey = milestoneKey(normalized);
		const aliasKeys = new Set<string>([inputKey]);
		const looksLikeMilestoneId = /^\d+$/.test(normalized) || /^m-\d+$/i.test(normalized);
		const canonicalInputId =
			/^\d+$/.test(normalized) || /^m-\d+$/i.test(normalized)
				? `m-${String(Number.parseInt(normalized.replace(/^m-/i, ""), 10))}`
				: null;
		if (/^\d+$/.test(normalized)) {
			const numericAlias = String(Number.parseInt(normalized, 10));
			aliasKeys.add(numericAlias);
			aliasKeys.add(`m-${numericAlias}`);
		} else {
			const idMatch = normalized.match(/^m-(\d+)$/i);
			if (idMatch?.[1]) {
				const numericAlias = String(Number.parseInt(idMatch[1], 10));
				aliasKeys.add(numericAlias);
				aliasKeys.add(`m-${numericAlias}`);
			}
		}
		const idMatchesAlias = (milestoneId: string): boolean => {
			const idKey = milestoneKey(milestoneId);
			if (aliasKeys.has(idKey)) {
				return true;
			}
			if (/^\d+$/.test(milestoneId.trim())) {
				const numericAlias = String(Number.parseInt(milestoneId.trim(), 10));
				return aliasKeys.has(numericAlias) || aliasKeys.has(`m-${numericAlias}`);
			}
			const idMatch = milestoneId.trim().match(/^m-(\d+)$/i);
			if (!idMatch?.[1]) {
				return false;
			}
			const numericAlias = String(Number.parseInt(idMatch[1], 10));
			return aliasKeys.has(numericAlias) || aliasKeys.has(`m-${numericAlias}`);
		};
		const findIdMatch = (milestones: Milestone[]): Milestone | undefined => {
			const rawExactMatch = milestones.find((item) => milestoneKey(item.id) === inputKey);
			if (rawExactMatch) {
				return rawExactMatch;
			}
			if (canonicalInputId) {
				const canonicalRawMatch = milestones.find((item) => milestoneKey(item.id) === canonicalInputId);
				if (canonicalRawMatch) {
					return canonicalRawMatch;
				}
			}
			return milestones.find((item) => idMatchesAlias(item.id));
		};
		const findUniqueTitleMatch = (milestones: Milestone[]): Milestone | null => {
			const titleMatches = milestones.filter((item) => milestoneKey(item.title) === inputKey);
			if (titleMatches.length === 1) {
				return titleMatches[0] ?? null;
			}
			return null;
		};
		const resolveByAlias = (milestones: Milestone[]): string | null => {
			const idMatch = findIdMatch(milestones);
			const titleMatch = findUniqueTitleMatch(milestones);
			if (looksLikeMilestoneId) {
				return idMatch?.id ?? null;
			}
			if (titleMatch) {
				return titleMatch.id;
			}
			if (idMatch) {
				return idMatch.id;
			}
			return null;
		};

		const activeTitleMatches = activeMilestones.filter((item) => milestoneKey(item.title) === inputKey);
		const hasAmbiguousActiveTitle = activeTitleMatches.length > 1;
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
			if (hasAmbiguousActiveTitle) {
				return normalized;
			}
			const archivedTitleMatch = findUniqueTitleMatch(archivedMilestones);
			return archivedTitleMatch?.id ?? normalized;
		}

		const activeMatch = resolveByAlias(activeMilestones);
		if (activeMatch) {
			return activeMatch;
		}
		if (hasAmbiguousActiveTitle) {
			return normalized;
		}
		return resolveByAlias(archivedMilestones) ?? normalized;
	}

	private isDoneStatus(status?: string | null): boolean {
		const normalized = (status ?? "").trim().toLowerCase();
		return normalized.includes("done") || normalized.includes("complete");
	}

	private isDraftStatus(status?: string | null): boolean {
		return (status ?? "").trim().toLowerCase() === "draft";
	}

	private formatStateSummaryLine(state: State, options: { includeStatus?: boolean } = {}): string {
		const priorityIndicator = state.priority ? `[${state.priority.toUpperCase()}] ` : "";
		const status = state.status || (state.source === "completed" ? "Done" : "");
		const statusText = options.includeStatus && status ? ` (${status})` : "";
		return `  ${priorityIndicator}${state.id} - ${state.title}${statusText}`;
	}

	private async loadStateOrThrow(id: string): Promise<State> {
		const state = await this.core.getState(id);
		if (!state) {
			throw new McpError(`State not found: ${id}`, "STATE_NOT_FOUND");
		}
		return state;
	}

	async createState(args: StateCreateArgs): Promise<CallToolResult> {
		try {
			const acceptanceCriteria =
				args.acceptanceCriteria
					?.map((text) => String(text).trim())
					.filter((text) => text.length > 0)
					.map((text) => ({ text, checked: false })) ?? undefined;

			const milestone =
				typeof args.milestone === "string" ? await this.resolveMilestoneInput(args.milestone) : undefined;

			const { state: createdState } = await this.core.createStateFromInput({
				title: args.title,
				description: args.description,
				status: args.status,
				priority: args.priority,
				milestone,
				labels: args.labels,
				assignee: args.assignee,
				dependencies: args.dependencies,
				references: args.references,
				documentation: args.documentation,
				parentStateId: args.parentStateId,
				finalSummary: args.finalSummary,
				acceptanceCriteria,
				definitionOfDoneAdd: args.definitionOfDoneAdd,
				disableDefinitionOfDoneDefaults: args.disableDefinitionOfDoneDefaults,
			});

			return await formatStateCallResult(createdState);
		} catch (error) {
			if (error instanceof Error) {
				throw new McpError(error.message, "VALIDATION_ERROR");
			}
			throw new McpError(String(error), "VALIDATION_ERROR");
		}
	}

	async listStates(args: StateListArgs = {}): Promise<CallToolResult> {
		if (this.isDraftStatus(args.status)) {
			let drafts = await this.core.filesystem.listDrafts();
			if (args.search) {
				const draftSearch = createStateSearchIndex(drafts);
				drafts = draftSearch.search({ query: args.search, status: "Draft" });
			}

			if (args.assignee) {
				drafts = drafts.filter((draft) => (draft.assignee ?? []).includes(args.assignee ?? ""));
			}
			if (args.milestone) {
				const [activeMilestones, archivedMilestones] = await Promise.all([
					this.core.filesystem.listMilestones(),
					this.core.filesystem.listArchivedMilestones(),
				]);
				const resolveMilestoneFilterValue = createMilestoneFilterValueResolver([
					...activeMilestones,
					...archivedMilestones,
				]);
				const milestoneFilter = resolveClosestMilestoneFilterValue(
					args.milestone,
					drafts.map((draft) => resolveMilestoneFilterValue(draft.milestone ?? "")),
				);
				drafts = drafts.filter(
					(draft) =>
						normalizeMilestoneFilterValue(resolveMilestoneFilterValue(draft.milestone ?? "")) === milestoneFilter,
				);
			}

			const labelFilters = args.labels ?? [];
			if (labelFilters.length > 0) {
				drafts = drafts.filter((draft) => {
					const draftLabels = draft.labels ?? [];
					return labelFilters.every((label) => draftLabels.includes(label));
				});
			}

			if (drafts.length === 0) {
				return {
					content: [
						{
							type: "text",
							text: "No states found.",
						},
					],
				};
			}

			let sortedDrafts = sortStates(drafts, "priority");
			if (typeof args.limit === "number" && args.limit >= 0) {
				sortedDrafts = sortedDrafts.slice(0, args.limit);
			}
			const lines = ["Draft:"];
			for (const draft of sortedDrafts) {
				lines.push(this.formatStateSummaryLine(draft));
			}

			return {
				content: [
					{
						type: "text",
						text: lines.join("\n"),
					},
				],
			};
		}

		const filters: StateListFilter = {};
		if (args.status) {
			filters.status = args.status;
		}
		if (args.assignee) {
			filters.assignee = args.assignee;
		}
		if (args.milestone) {
			filters.milestone = args.milestone;
		}

		const states = await this.core.queryStates({
			query: args.search,
			limit: args.limit,
			filters: Object.keys(filters).length > 0 ? filters : undefined,
			includeCrossBranch: false,
		});

		let filteredByLabels = states.filter((state) => isLocalEditableState(state));
		const labelFilters = args.labels ?? [];
		if (labelFilters.length > 0) {
			filteredByLabels = filteredByLabels.filter((state) => {
				const stateLabels = state.labels ?? [];
				return labelFilters.every((label) => stateLabels.includes(label));
			});
		}

		if (filteredByLabels.length === 0) {
			return {
				content: [
					{
						type: "text",
						text: "No states found.",
					},
				],
			};
		}

		const config = await this.core.filesystem.loadConfig();
		const statuses = config?.statuses ?? [];

		const canonicalByLower = new Map<string, string>();
		for (const status of statuses) {
			canonicalByLower.set(status.toLowerCase(), status);
		}

		const grouped = new Map<string, State[]>();
		for (const state of filteredByLabels) {
			const rawStatus = (state.status ?? "").trim();
			const canonicalStatus = canonicalByLower.get(rawStatus.toLowerCase()) ?? rawStatus;
			const bucketKey = canonicalStatus || "";
			const existing = grouped.get(bucketKey) ?? [];
			existing.push(state);
			grouped.set(bucketKey, existing);
		}

		const orderedStatuses = [
			...statuses.filter((status) => grouped.has(status)),
			...Array.from(grouped.keys()).filter((status) => !statuses.includes(status)),
		];

		const contentItems: Array<{ type: "text"; text: string }> = [];
		for (const status of orderedStatuses) {
			const bucket = grouped.get(status) ?? [];
			const sortedBucket = sortStates(bucket, "priority");
			const sectionLines: string[] = [`${status || "No Status"}:`];
			for (const state of sortedBucket) {
				sectionLines.push(this.formatStateSummaryLine(state));
			}
			contentItems.push({
				type: "text",
				text: sectionLines.join("\n"),
			});
		}

		if (contentItems.length === 0) {
			contentItems.push({
				type: "text",
				text: "No states found.",
			});
		}

		return {
			content: contentItems,
		};
	}

	async searchStates(args: StateSearchArgs): Promise<CallToolResult> {
		const query = args.query.trim();
		if (!query) {
			throw new McpError("Search query cannot be empty", "VALIDATION_ERROR");
		}

		if (this.isDraftStatus(args.status)) {
			const drafts = await this.core.filesystem.listDrafts();
			const searchIndex = createStateSearchIndex(drafts);
			let draftMatches = searchIndex.search({
				query,
				status: "Draft",
				priority: args.priority,
			});
			if (typeof args.limit === "number" && args.limit >= 0) {
				draftMatches = draftMatches.slice(0, args.limit);
			}

			if (draftMatches.length === 0) {
				return {
					content: [
						{
							type: "text",
							text: `No states found for "${query}".`,
						},
					],
				};
			}

			const lines: string[] = ["States:"];
			for (const draft of draftMatches) {
				lines.push(this.formatStateSummaryLine(draft, { includeStatus: true }));
			}

			return {
				content: [
					{
						type: "text",
						text: lines.join("\n"),
					},
				],
			};
		}

		const states = await this.core.loadStates(undefined, undefined, { includeCompleted: true });
		const searchIndex = createStateSearchIndex(states);
		let stateMatches = searchIndex.search({
			query,
			status: args.status,
			priority: args.priority,
		});
		if (typeof args.limit === "number" && args.limit >= 0) {
			stateMatches = stateMatches.slice(0, args.limit);
		}

		const stateResults = stateMatches.filter((state) => isLocalEditableState(state));
		if (stateResults.length === 0) {
			return {
				content: [
					{
						type: "text",
						text: `No states found for "${query}".`,
					},
				],
			};
		}

		const lines: string[] = ["States:"];
		for (const state of stateResults) {
			lines.push(this.formatStateSummaryLine(state, { includeStatus: true }));
		}

		return {
			content: [
				{
					type: "text",
					text: lines.join("\n"),
				},
			],
		};
	}

	async viewState(args: { id: string }): Promise<CallToolResult> {
		const draft = await this.core.filesystem.loadDraft(args.id);
		if (draft) {
			return await formatStateCallResult(draft);
		}

		const state = await this.core.getStateWithSubstates(args.id);
		if (!state) {
			throw new McpError(`State not found: ${args.id}`, "STATE_NOT_FOUND");
		}
		return await formatStateCallResult(state);
	}

	async archiveState(args: { id: string }): Promise<CallToolResult> {
		const draft = await this.core.filesystem.loadDraft(args.id);
		if (draft) {
			const success = await this.core.archiveDraft(draft.id);
			if (!success) {
				throw new McpError(`Failed to archive state: ${args.id}`, "OPERATION_FAILED");
			}

			return await formatStateCallResult(draft, [`Archived draft ${draft.id}.`]);
		}

		const state = await this.loadStateOrThrow(args.id);

		if (!isLocalEditableState(state)) {
			throw new McpError(`Cannot archive state from another branch: ${state.id}`, "VALIDATION_ERROR");
		}

		if (this.isDoneStatus(state.status)) {
			throw new McpError(
				`State ${state.id} is Done. Done states should be completed (moved to the completed folder), not archived. Use state_complete instead.`,
				"VALIDATION_ERROR",
			);
		}

		const success = await this.core.archiveState(state.id);
		if (!success) {
			throw new McpError(`Failed to archive state: ${args.id}`, "OPERATION_FAILED");
		}

		const refreshed = (await this.core.getState(state.id)) ?? state;
		return await formatStateCallResult(refreshed);
	}

	async completeState(args: { id: string }): Promise<CallToolResult> {
		const state = await this.loadStateOrThrow(args.id);

		if (!isLocalEditableState(state)) {
			throw new McpError(`Cannot complete state from another branch: ${state.id}`, "VALIDATION_ERROR");
		}

		if (!this.isDoneStatus(state.status)) {
			throw new McpError(
				`State ${state.id} is not Done. Set status to "Done" with state_edit before completing it.`,
				"VALIDATION_ERROR",
			);
		}

		const filePath = state.filePath ?? null;
		const completedFilePath = filePath ? join(this.core.filesystem.completedDir, basename(filePath)) : undefined;

		const success = await this.core.completeState(state.id);
		if (!success) {
			throw new McpError(`Failed to complete state: ${args.id}`, "OPERATION_FAILED");
		}

		return await formatStateCallResult(state, [`Completed state ${state.id}.`], {
			filePathOverride: completedFilePath,
		});
	}

	async demoteState(args: { id: string }): Promise<CallToolResult> {
		const state = await this.loadStateOrThrow(args.id);
		const success = await this.core.demoteState(state.id, false);
		if (!success) {
			throw new McpError(`Failed to demote state: ${args.id}`, "OPERATION_FAILED");
		}

		const refreshed = (await this.core.getState(state.id)) ?? state;
		return await formatStateCallResult(refreshed);
	}

	async editState(args: StateEditRequest): Promise<CallToolResult> {
		try {
			const updateInput = buildStateUpdateInput(args);
			if (typeof updateInput.milestone === "string") {
				updateInput.milestone = await this.resolveMilestoneInput(updateInput.milestone);
			}
			const updatedState = await this.core.editStateOrDraft(args.id, updateInput);
			return await formatStateCallResult(updatedState);
		} catch (error) {
			if (error instanceof Error) {
				throw new McpError(error.message, "VALIDATION_ERROR");
			}
			throw new McpError(String(error), "VALIDATION_ERROR");
		}
	}
}

export type { StateEditArgs, StateEditRequest };
