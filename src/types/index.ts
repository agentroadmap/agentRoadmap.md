export type StateStatus = string;

/**
 * Entity types in the roadmap system.
 * Used for ID generation and prefix resolution.
 */
export enum EntityType {
	State = "state",
	Draft = "draft",
	Document = "document",
	Decision = "decision",
}

// Structured Acceptance Criterion (domain-level)
export interface AcceptanceCriterion {
	index: number; // 1-based
	text: string;
	checked: boolean;
}

export interface AcceptanceCriterionInput {
	text: string;
	checked?: boolean;
}

export type State = State;
export interface State {
	id: string;
	title: string;
	status: StateStatus;
	assignee: string[];
	reporter?: string;
	createdDate: string;
	updatedDate?: string;
	labels: string[];
	milestone?: string;
	dependencies: string[];
	references?: string[];
	documentation?: string[];
	readonly rawContent?: string; // Raw markdown content without frontmatter (read-only: do not modify directly)
	description?: string;
	implementationPlan?: string;
	implementationNotes?: string;
	finalSummary?: string;
	/** Structured acceptance criteria parsed from body (checked state + text + index) */
	acceptanceCriteriaItems?: AcceptanceCriterion[];
	/** Structured Definition of Done checklist parsed from body (checked state + text + index) */
	definitionOfDoneItems?: AcceptanceCriterion[];
	parentStateId?: string;
	parentStateTitle?: string;
	substates?: string[];
	type?: "terminal" | "transitional" | "operational" | "spike";
	hype?: string;
	substateSummaries?: Array<{ id: string; title: string }>;
	requires?: string[];
	unlocks?: string[];
	priority?: "high" | "medium" | "low";
	branch?: string;
	ordinal?: number;
	filePath?: string;
	// Metadata fields
	lastModified?: Date;
	source?: "local" | "remote" | "completed" | "local-branch";
	/** Optional per-state callback command to run on status change (overrides global config) */
	onStatusChange?: string;
}

export interface MilestoneBucket {
	key: string;
	label: string;
	milestone?: string;
	isNoMilestone: boolean;
	isCompleted: boolean;
	states: State[];
	statusCounts: Record<string, number>;
	total: number;
	doneCount: number;
	progress: number;
}

export interface MilestoneSummary {
	milestones: string[];
	buckets: MilestoneBucket[];
}

/**
 * Check if a state is locally editable (not from a remote or other local branch)
 */
export function isLocalEditableState(state: State): boolean {
	return state.source === undefined || state.source === "local" || state.source === "completed";
}

export interface StateCreateInput {
	title: string;
	description?: string;
	status?: StateStatus;
	priority?: "high" | "medium" | "low";
	milestone?: string;
	labels?: string[];
	assignee?: string[];
	dependencies?: string[];
	references?: string[];
	documentation?: string[];
	parentStateId?: string;
	implementationPlan?: string;
	implementationNotes?: string;
	finalSummary?: string;
	acceptanceCriteria?: AcceptanceCriterionInput[];
	definitionOfDoneAdd?: string[];
	disableDefinitionOfDoneDefaults?: boolean;
	rawContent?: string;
}

export interface StateUpdateInput {
	title?: string;
	description?: string;
	status?: StateStatus;
	priority?: "high" | "medium" | "low";
	milestone?: string | null;
	labels?: string[];
	addLabels?: string[];
	removeLabels?: string[];
	assignee?: string[];
	ordinal?: number;
	dependencies?: string[];
	addDependencies?: string[];
	removeDependencies?: string[];
	references?: string[];
	addReferences?: string[];
	removeReferences?: string[];
	documentation?: string[];
	addDocumentation?: string[];
	removeDocumentation?: string[];
	implementationPlan?: string;
	appendImplementationPlan?: string[];
	clearImplementationPlan?: boolean;
	implementationNotes?: string;
	appendImplementationNotes?: string[];
	clearImplementationNotes?: boolean;
	finalSummary?: string;
	appendFinalSummary?: string[];
	clearFinalSummary?: boolean;
	acceptanceCriteria?: AcceptanceCriterionInput[];
	addAcceptanceCriteria?: Array<AcceptanceCriterionInput | string>;
	removeAcceptanceCriteria?: number[];
	checkAcceptanceCriteria?: number[];
	uncheckAcceptanceCriteria?: number[];
	addDefinitionOfDone?: Array<AcceptanceCriterionInput | string>;
	removeDefinitionOfDone?: number[];
	checkDefinitionOfDone?: number[];
	uncheckDefinitionOfDone?: number[];
	rawContent?: string;
}

export interface StateListFilter {
	status?: string;
	assignee?: string;
	priority?: "high" | "medium" | "low";
	milestone?: string;
	parentStateId?: string;
	labels?: string[];
}

export interface Decision {
	id: string;
	title: string;
	date: string;
	status: "proposed" | "accepted" | "rejected" | "superseded";
	context: string;
	decision: string;
	consequences: string;
	alternatives?: string;
	readonly rawContent: string; // Raw markdown content without frontmatter
}

export interface Milestone {
	id: string;
	title: string;
	description: string;
	readonly rawContent: string; // Raw markdown content without frontmatter
}

export interface Document {
	id: string;
	title: string;
	type: "readme" | "guide" | "specification" | "other";
	createdDate: string;
	updatedDate?: string;
	rawContent: string; // Raw markdown content without frontmatter
	tags?: string[];
	// Web UI specific fields
	name?: string;
	path?: string;
	lastModified?: string;
}

export type SearchResultType = "state" | "document" | "decision";

export type SearchPriorityFilter = "high" | "medium" | "low";

export interface SearchMatch {
	key?: string;
	indices: Array<[number, number]>;
	value?: unknown;
}

export interface SearchFilters {
	status?: string | string[];
	priority?: SearchPriorityFilter | SearchPriorityFilter[];
	assignee?: string | string[];
	labels?: string | string[];
}

export interface SearchOptions {
	query?: string;
	limit?: number;
	types?: SearchResultType[];
	filters?: SearchFilters;
}

export interface StateSearchResult {
	type: "state";
	score: number | null;
	state: State;
	matches?: SearchMatch[];
}

export interface DocumentSearchResult {
	type: "document";
	score: number | null;
	document: Document;
	matches?: SearchMatch[];
}

export interface DecisionSearchResult {
	type: "decision";
	score: number | null;
	decision: Decision;
	matches?: SearchMatch[];
}

export type SearchResult = StateSearchResult | DocumentSearchResult | DecisionSearchResult;

export interface Sequence {
	/** 1-based sequence index */
	index: number;
	/** States that can be executed in parallel within this sequence */
	states: State[];
}

/**
 * Configuration for ID prefixes used in state files.
 * Allows customization of state prefix (e.g., "JIRA-", "issue-", "bug-").
 * Note: Draft prefix is always "draft" and not configurable.
 */
export interface PrefixConfig {
	/** Prefix for state IDs (default: "state") - produces IDs like STATE-1, STATE-2 */
	state: string;
}

export interface RoadmapConfig {
	projectName: string;
	defaultAssignee?: string;
	defaultReporter?: string;
	statuses: string[];
	labels: string[];
	/** @deprecated Milestones are sourced from milestone files, not config. */
	milestones?: string[];
	definitionOfDone?: string[];
	defaultStatus?: string;
	dateFormat: string;
	maxColumnWidth?: number;
	stateResolutionStrategy?: "most_recent" | "most_progressed";
	defaultEditor?: string;
	autoOpenBrowser?: boolean;
	defaultPort?: number;
	remoteOperations?: boolean;
	autoCommit?: boolean;
	zeroPaddedIds?: number;
	includeDateTimeInDates?: boolean; // Whether to include time in new dates
	bypassGitHooks?: boolean;
	checkActiveBranches?: boolean; // Check state states across active branches (default: true)
	activeBranchDays?: number; // How many days a branch is considered active (default: 30)
	/** Global callback command to run on any state status change. Supports $STATE_ID, $OLD_STATUS, $NEW_STATUS, $STATE_TITLE variables. */
	onStatusChange?: string;
	/** ID prefix configuration for states and drafts. Defaults to { state: "state", draft: "draft" } */
	prefixes?: PrefixConfig;
	mcp?: {
		http?: {
			host?: string;
			port?: number;
			auth?: {
				type?: "bearer" | "basic" | "none";
				token?: string;
				username?: string;
				password?: string;
			};
			cors?: {
				origin?: string | string[];
				credentials?: boolean;
			};
			enableDnsRebindingProtection?: boolean;
			allowedHosts?: string[];
			allowedOrigins?: string[];
		};
	};
}

export interface ParsedMarkdown {
	frontmatter: Record<string, unknown>;
	content: string;
}
