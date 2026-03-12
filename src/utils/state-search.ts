/**
 * In-memory state search using Fuse.js
 * Used when states are already loaded to avoid re-fetching via ContentStore
 */

import Fuse from "fuse.js";
import type { State } from "../types/index.ts";

export interface StateSearchOptions {
	query?: string;
	status?: string;
	priority?: "high" | "medium" | "low";
	labels?: string[];
}

export interface SharedStateFilterOptions {
	query?: string;
	priority?: "high" | "medium" | "low";
	labels?: string[];
	milestone?: string;
	resolveMilestoneLabel?: (milestone: string) => string;
}

export interface StateFilterOptions extends SharedStateFilterOptions {
	status?: string;
}

export interface StateSearchIndex {
	search(options: StateSearchOptions): State[];
}

// Regex pattern to match any prefix (letters followed by dash)
const PREFIX_PATTERN = /^[a-zA-Z]+-/i;

/**
 * Extract prefix from an ID if present (e.g., "state-" from "state-123")
 */
function extractPrefix(id: string): string | null {
	const match = id.match(PREFIX_PATTERN);
	return match ? match[0] : null;
}

/**
 * Strip any prefix from an ID (e.g., "state-123" -> "123", "JIRA-456" -> "456")
 */
function stripPrefix(id: string): string {
	return id.replace(PREFIX_PATTERN, "");
}

function createStateIdVariants(id: string): string[] {
	const segments = parseStateIdSegments(id);
	const prefix = extractPrefix(id) ?? "state-"; // Default to state- if no prefix
	const lowerId = id.toLowerCase();

	if (!segments) {
		// Non-numeric ID - just return the ID and its lowercase variant
		return id === lowerId ? [id] : [id, lowerId];
	}

	const canonicalSuffix = segments.join(".");
	const variants = new Set<string>();

	// Add original ID and lowercase variant
	variants.add(id);
	variants.add(lowerId);

	// Add with extracted/default prefix
	variants.add(`${prefix}${canonicalSuffix}`);
	variants.add(`${prefix.toLowerCase()}${canonicalSuffix}`);

	// Add just the numeric part
	variants.add(canonicalSuffix);

	return Array.from(variants);
}

function parseStateIdSegments(value: string): number[] | null {
	const withoutPrefix = stripPrefix(value);
	if (!/^[0-9]+(?:\.[0-9]+)*$/.test(withoutPrefix)) {
		return null;
	}
	return withoutPrefix.split(".").map((segment) => Number.parseInt(segment, 10));
}

interface SearchableState {
	state: State;
	title: string;
	bodyText: string;
	id: string;
	idVariants: string[];
	dependencyIds: string[];
	statusLower: string;
	priorityLower?: string;
	labelsLower: string[];
}

function buildSearchableState(state: State): SearchableState {
	const bodyParts: string[] = [];
	if (state.description) bodyParts.push(state.description);
	if (Array.isArray(state.acceptanceCriteriaItems) && state.acceptanceCriteriaItems.length > 0) {
		const lines = [...state.acceptanceCriteriaItems]
			.sort((a, b) => a.index - b.index)
			.map((criterion) => `- [${criterion.checked ? "x" : " "}] ${criterion.text}`);
		bodyParts.push(lines.join("\n"));
	}
	if (state.implementationPlan) bodyParts.push(state.implementationPlan);
	if (state.implementationNotes) bodyParts.push(state.implementationNotes);
	if (state.labels?.length) bodyParts.push(state.labels.join(" "));
	if (state.assignee?.length) bodyParts.push(state.assignee.join(" "));

	return {
		state,
		title: state.title,
		bodyText: bodyParts.join(" "),
		id: state.id,
		idVariants: createStateIdVariants(state.id),
		dependencyIds: (state.dependencies ?? []).flatMap((dependency) => createStateIdVariants(dependency)),
		statusLower: (state.status || "").toLowerCase(),
		priorityLower: state.priority?.toLowerCase(),
		labelsLower: (state.labels || []).map((label) => label.toLowerCase()),
	};
}

/**
 * Create an in-memory search index for states
 */
export function createStateSearchIndex(states: State[]): StateSearchIndex {
	const searchableStates = states.map(buildSearchableState);

	const fuse = new Fuse(searchableStates, {
		includeScore: true,
		threshold: 0.35,
		ignoreLocation: true,
		minMatchCharLength: 2,
		keys: [
			{ name: "title", weight: 0.35 },
			{ name: "bodyText", weight: 0.3 },
			{ name: "id", weight: 0.2 },
			{ name: "idVariants", weight: 0.1 },
			{ name: "dependencyIds", weight: 0.05 },
		],
	});

	return {
		search(options: StateSearchOptions): State[] {
			let results: SearchableState[];

			// If we have a query, use Fuse for fuzzy search
			if (options.query?.trim()) {
				const fuseResults = fuse.search(options.query.trim());
				results = fuseResults.map((r) => r.item);
			} else {
				// No query - start with all states
				results = [...searchableStates];
			}

			// Apply status filter
			if (options.status) {
				const statusLower = options.status.toLowerCase();
				results = results.filter((t) => t.statusLower === statusLower);
			}

			// Apply priority filter
			if (options.priority) {
				const priorityLower = options.priority.toLowerCase();
				results = results.filter((t) => t.priorityLower === priorityLower);
			}

			// Apply label filters (state must include any selected label)
			if (options.labels && options.labels.length > 0) {
				const required = options.labels.map((label) => label.toLowerCase());
				results = results.filter((t) => {
					if (!t.labelsLower || t.labelsLower.length === 0) {
						return false;
					}
					const labelSet = new Set(t.labelsLower);
					return required.some((label) => labelSet.has(label));
				});
			}

			return results.map((r) => r.state);
		},
	};
}

function applyMilestoneFilter(
	states: State[],
	milestone: string,
	resolveMilestoneLabel?: (milestone: string) => string,
): State[] {
	const normalizedMilestone = milestone.trim().toLowerCase();
	if (!normalizedMilestone) {
		return states;
	}

	return states.filter((state) => {
		if (!state.milestone) {
			return false;
		}
		const value = resolveMilestoneLabel ? resolveMilestoneLabel(state.milestone) : state.milestone;
		return value.trim().toLowerCase() === normalizedMilestone;
	});
}

export function applyStateFilters(states: State[], options: StateFilterOptions, index?: StateSearchIndex): State[] {
	const query = options.query?.trim() ?? "";
	const hasBaseFilters = Boolean(
		query || options.status || options.priority || (options.labels && options.labels.length > 0),
	);

	let results = hasBaseFilters
		? (index ?? createStateSearchIndex(states)).search({
				query,
				status: options.status,
				priority: options.priority,
				labels: options.labels,
			})
		: [...states];

	if (options.milestone) {
		results = applyMilestoneFilter(results, options.milestone, options.resolveMilestoneLabel);
	}

	return results;
}

export function applySharedStateFilters(
	states: State[],
	options: SharedStateFilterOptions,
	index?: StateSearchIndex,
): State[] {
	return applyStateFilters(
		states,
		{
			query: options.query,
			priority: options.priority,
			labels: options.labels,
			milestone: options.milestone,
			resolveMilestoneLabel: options.resolveMilestoneLabel,
		},
		index,
	);
}
