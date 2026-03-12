/**
 * Unified view manager that handles Tab switching between state views and kanban board
 */

import type { Core } from "../core/roadmap.ts";
import type { Milestone, State } from "../types/index.ts";
import { watchConfig } from "../utils/config-watcher.ts";
import { collectAvailableLabels } from "../utils/label-filter.ts";
import { hasAnyPrefix } from "../utils/prefix-config.ts";
import { applySharedStateFilters, createStateSearchIndex } from "../utils/state-search.ts";
import { watchStates } from "../utils/state-watcher.ts";
import { renderBoardTui } from "./board.ts";
import { createLoadingScreen } from "./loading.ts";
import { buildStateViewerMilestoneFilterModel, viewStateEnhanced } from "./state-viewer-with-search.ts";
import { type ViewState, ViewSwitcher, type ViewType } from "./view-switcher.ts";

export interface UnifiedViewOptions {
	core: Core;
	initialView: ViewType;
	selectedState?: State;
	states?: State[];
	statesLoader?: (updateProgress: (message: string) => void) => Promise<{ states: State[]; statuses: string[] }>;
	loadingScreenFactory?: (initialMessage: string) => Promise<LoadingScreen | null>;
	title?: string;
	filter?: {
		status?: string;
		assignee?: string;
		priority?: string;
		labels?: string[];
		milestone?: string;
		sort?: string;
		title?: string;
		filterDescription?: string;
		searchQuery?: string;
		parentStateId?: string;
	};
	preloadedKanbanData?: {
		states: State[];
		statuses: string[];
	};
	milestoneMode?: boolean;
	milestoneEntities?: Milestone[];
}

type LoadingScreen = {
	update(message: string): void;
	close(): Promise<void> | void;
};

export interface UnifiedViewLoadResult {
	states: State[];
	statuses: string[];
}

export interface UnifiedViewFilters {
	searchQuery: string;
	statusFilter: string;
	priorityFilter: string;
	labelFilter: string[];
	milestoneFilter: string;
}

export interface KanbanSharedFilters {
	searchQuery: string;
	priorityFilter: string;
	labelFilter: string[];
	milestoneFilter: string;
}

export function createKanbanSharedFilters(filters: UnifiedViewFilters): KanbanSharedFilters {
	return {
		searchQuery: filters.searchQuery,
		priorityFilter: filters.priorityFilter,
		labelFilter: [...filters.labelFilter],
		milestoneFilter: filters.milestoneFilter,
	};
}

export function filterStatesForKanban(
	states: State[],
	filters: KanbanSharedFilters,
	resolveMilestoneLabel?: (milestone: string) => string,
): State[] {
	if (
		!filters.searchQuery.trim() &&
		!filters.priorityFilter &&
		filters.labelFilter.length === 0 &&
		!filters.milestoneFilter
	) {
		return [...states];
	}

	const searchIndex = createStateSearchIndex(states);
	return applySharedStateFilters(
		states,
		{
			query: filters.searchQuery,
			priority: filters.priorityFilter as "high" | "medium" | "low" | undefined,
			labels: filters.labelFilter,
			milestone: filters.milestoneFilter || undefined,
			resolveMilestoneLabel,
		},
		searchIndex,
	);
}

export function createUnifiedViewFilters(filter: UnifiedViewOptions["filter"] | undefined): UnifiedViewFilters {
	return {
		searchQuery: filter?.searchQuery || "",
		statusFilter: filter?.status || "",
		priorityFilter: filter?.priority || "",
		labelFilter: [...(filter?.labels || [])],
		milestoneFilter: filter?.milestone || "",
	};
}

export function mergeUnifiedViewFilters(current: UnifiedViewFilters, update: UnifiedViewFilters): UnifiedViewFilters {
	return {
		...current,
		searchQuery: update.searchQuery,
		statusFilter: update.statusFilter,
		priorityFilter: update.priorityFilter,
		labelFilter: [...update.labelFilter],
		milestoneFilter: update.milestoneFilter,
	};
}

export async function loadStatesForUnifiedView(
	core: Core,
	options: Pick<UnifiedViewOptions, "states" | "statesLoader" | "loadingScreenFactory">,
): Promise<UnifiedViewLoadResult> {
	if (options.states && options.states.length > 0) {
		const config = await core.filesystem.loadConfig();
		return {
			states: options.states,
			statuses: config?.statuses || ["To Do", "In Progress", "Done"],
		};
	}

	const loader =
		options.statesLoader ||
		(async (updateProgress: (message: string) => void): Promise<{ states: State[]; statuses: string[] }> => {
			const states = await core.loadStates(updateProgress);
			const config = await core.filesystem.loadConfig();
			return {
				states,
				statuses: config?.statuses || ["To Do", "In Progress", "Done"],
			};
		});

	const loadingScreenFactory = options.loadingScreenFactory || createLoadingScreen;
	const loadingScreen = await loadingScreenFactory("Loading states");

	try {
		const result = await loader((message) => {
			loadingScreen?.update(message);
		});

		return {
			states: result.states,
			statuses: result.statuses,
		};
	} finally {
		await loadingScreen?.close();
	}
}

type ViewResult = "switch" | "exit";

/**
 * Main unified view controller that handles Tab switching between views
 */
export async function runUnifiedView(options: UnifiedViewOptions): Promise<void> {
	try {
		const { states: loadedStates, statuses: loadedStatuses } = await loadStatesForUnifiedView(options.core, {
			states: options.states,
			statesLoader: options.statesLoader,
			loadingScreenFactory: options.loadingScreenFactory,
		});

		const baseStates = (loadedStates || []).filter((t) => t.id && t.id.trim() !== "" && hasAnyPrefix(t.id));
		if (baseStates.length === 0) {
			if (options.filter?.parentStateId) {
				console.log(`No child states found for parent state ${options.filter.parentStateId}.`);
			} else {
				console.log("No states found.");
			}
			return;
		}
		const initialConfig = await options.core.filesystem.loadConfig();
		let configuredLabels = initialConfig?.labels ?? [];
		let milestoneEntities = await options.core.filesystem.listMilestones();
		let milestoneFilterModel = buildStateViewerMilestoneFilterModel(milestoneEntities);
		let currentFilters = createUnifiedViewFilters(options.filter);
		const initialState: ViewState = {
			type: options.initialView,
			selectedState: options.selectedState,
			states: baseStates,
			filter: options.filter,
			// Initialize kanban data if starting with kanban view
			kanbanData:
				options.initialView === "kanban"
					? {
							states: baseStates,
							statuses: loadedStatuses,
							isLoading: false,
						}
					: undefined,
		};

		let isRunning = true;
		let viewSwitcher: ViewSwitcher | null = null;
		let currentView: ViewType = options.initialView;
		let selectedState: State | undefined = options.selectedState;
		let states = baseStates;
		let kanbanStatuses = loadedStatuses ?? [];
		let boardUpdater: ((nextStates: State[], nextStatuses: string[]) => void) | null = null;

		const getRenderableStates = () => states.filter((state) => state.id && state.id.trim() !== "" && hasAnyPrefix(state.id));
		const getBoardAvailableLabels = () => collectAvailableLabels(getRenderableStates(), configuredLabels);
		const getBoardAvailableMilestones = () => [...milestoneFilterModel.availableMilestoneTitles];

		const emitBoardUpdate = () => {
			if (!boardUpdater) return;
			boardUpdater(getRenderableStates(), kanbanStatuses);
		};
		let isInitialLoad = true; // Track if this is the first view load

		// Create view switcher (without problematic onViewChange callback)
		viewSwitcher = new ViewSwitcher({
			core: options.core,
			initialState,
		});
		const watcher = watchStates(options.core, {
			onStateAdded(state) {
				states.push(state);
				const state = viewSwitcher?.getState();
				viewSwitcher?.updateState({
					states,
					kanbanData: state?.kanbanData ? { ...state.kanbanData, states } : undefined,
				});
				emitBoardUpdate();
			},
			onStateChanged(state) {
				const idx = states.findIndex((t) => t.id === state.id);
				if (idx >= 0) {
					states[idx] = state;
				} else {
					states.push(state);
				}
				const state = viewSwitcher?.getState();
				viewSwitcher?.updateState({
					states,
					kanbanData: state?.kanbanData ? { ...state.kanbanData, states } : undefined,
				});
				emitBoardUpdate();
			},
			onStateRemoved(stateId) {
				states = states.filter((t) => t.id !== stateId);
				if (selectedState?.id === stateId) {
					selectedState = states[0];
				}
				const state = viewSwitcher?.getState();
				viewSwitcher?.updateState({
					states,
					kanbanData: state?.kanbanData ? { ...state.kanbanData, states } : undefined,
				});
				emitBoardUpdate();
			},
		});
		process.on("exit", () => watcher.stop());

		const configWatcher = watchConfig(options.core, {
			onConfigChanged: (config) => {
				kanbanStatuses = config?.statuses ?? [];
				configuredLabels = config?.labels ?? [];
				emitBoardUpdate();
			},
		});

		process.on("exit", () => configWatcher.stop());

		// Function to show state view
		const showStateView = async (): Promise<ViewResult> => {
			const availableStates = states.filter((t) => t.id && t.id.trim() !== "" && hasAnyPrefix(t.id));

			if (availableStates.length === 0) {
				console.log("No states available.");
				return "exit";
			}

			// Find the state to view - if selectedState has an ID, find it in available states
			let stateToView: State | undefined;
			if (selectedState?.id) {
				const foundState = availableStates.find((t) => t.id === selectedState?.id);
				stateToView = foundState || availableStates[0];
			} else {
				stateToView = availableStates[0];
			}

			if (!stateToView) {
				console.log("No state selected.");
				return "exit";
			}

			// Show enhanced state viewer with view switching support
			return new Promise<ViewResult>((resolve) => {
				let result: ViewResult = "exit"; // Default to exit

				const onTabPress = async () => {
					result = "switch";
				};

				// Determine initial focus based on where we're coming from
				// - If we have a search query on initial load, focus search
				// - If currentView is state-detail, focus detail
				// - Otherwise (including when coming from kanban), focus state list
				const hasSearchQuery = options.filter ? "searchQuery" in options.filter : false;
				const shouldFocusSearch = isInitialLoad && hasSearchQuery;

				viewStateEnhanced(stateToView, {
					states: availableStates,
					core: options.core,
					title: options.filter?.title,
					filterDescription: options.filter?.filterDescription,
					searchQuery: currentFilters.searchQuery,
					statusFilter: currentFilters.statusFilter,
					priorityFilter: currentFilters.priorityFilter,
					labelFilter: currentFilters.labelFilter,
					milestoneFilter: currentFilters.milestoneFilter,
					startWithDetailFocus: currentView === "state-detail",
					startWithSearchFocus: shouldFocusSearch,
					onStateChange: (newState) => {
						selectedState = newState;
						currentView = "state-detail";
					},
					onFilterChange: (filters) => {
						currentFilters = mergeUnifiedViewFilters(currentFilters, filters);
					},
					onTabPress,
				}).then(() => {
					// If user wants to exit, do it immediately
					if (result === "exit") {
						process.exit(0);
					}
					resolve(result);
				});
			});
		};

		// Function to show kanban view
		const showKanbanView = async (): Promise<ViewResult> => {
			const config = await options.core.filesystem.loadConfig();
			configuredLabels = config?.labels ?? configuredLabels;
			const layout = "horizontal" as const;
			const maxColumnWidth = config?.maxColumnWidth || 20;
			milestoneEntities = await options.core.filesystem.listMilestones();
			milestoneFilterModel = buildStateViewerMilestoneFilterModel(milestoneEntities);
			const kanbanStates = getRenderableStates();
			const statuses = kanbanStatuses;

			// Show kanban board with view switching support
			return new Promise<ViewResult>((resolve) => {
				let result: ViewResult = "exit"; // Default to exit

				const onTabPress = async () => {
					result = "switch";
				};

				renderBoardTui(kanbanStates, statuses, layout, maxColumnWidth, {
					onStateSelect: (state) => {
						selectedState = state;
					},
					onTabPress,
					filters: createKanbanSharedFilters(currentFilters),
					availableLabels: getBoardAvailableLabels(),
					availableMilestones: getBoardAvailableMilestones(),
					onFilterChange: (filters) => {
						currentFilters = {
							...currentFilters,
							searchQuery: filters.searchQuery,
							priorityFilter: filters.priorityFilter,
							labelFilter: [...filters.labelFilter],
							milestoneFilter: filters.milestoneFilter,
						};
					},
					subscribeUpdates: (updater) => {
						boardUpdater = updater;
						emitBoardUpdate();
					},
					milestoneMode: options.milestoneMode,
					milestoneEntities,
				}).then(() => {
					// If user wants to exit, do it immediately
					if (result === "exit") {
						process.exit(0);
					}
					boardUpdater = null;
					resolve(result);
				});
			});
		};

		// Main view loop
		while (isRunning) {
			// Show the current view and get the result
			let result: ViewResult;
			switch (currentView) {
				case "state-list":
				case "state-detail":
					result = await showStateView();
					break;
				case "kanban":
					result = await showKanbanView();
					break;
				default:
					result = "exit";
			}

			// After the first view, we're no longer on initial load
			isInitialLoad = false;

			// Handle the result
			if (result === "switch") {
				// User pressed Tab, switch to the next view
				switch (currentView) {
					case "state-list":
					case "state-detail":
						currentView = "kanban";
						break;
					case "kanban":
						// Always go to state-list view when switching from board, keeping selected state highlighted
						currentView = "state-list";
						break;
				}
			} else {
				// User pressed q/Esc, exit the loop
				isRunning = false;
			}
		}
	} catch (error) {
		console.error(error instanceof Error ? error.message : error);
		process.exit(1);
	}
}
