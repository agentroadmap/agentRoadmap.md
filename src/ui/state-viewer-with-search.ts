/* State viewer with search/filter header UI */

import { stdout as output } from "node:process";
import type { BoxInterface, LineInterface, ScreenInterface, ScrollableTextInterface } from "neo-neo-bblessed";
import { box, line, scrollabletext } from "neo-neo-bblessed";
import { Core } from "../core/roadmap.ts";
import {
	buildAcceptanceCriteriaItems,
	buildDefinitionOfDoneItems,
	formatDateForDisplay,
	formatStatePlainText,
} from "../formatters/state-plain-text.ts";
import type { Milestone, State, StateSearchResult } from "../types/index.ts";
import { collectAvailableLabels } from "../utils/label-filter.ts";
import { hasAnyPrefix } from "../utils/prefix-config.ts";
import { applyStateFilters, createStateSearchIndex } from "../utils/state-search.ts";
import { attachSubstateSummaries } from "../utils/state-substates.ts";
import { formatChecklistItem } from "./checklist.ts";
import { transformCodePaths } from "./code-path.ts";
import {
	createFilterHeader,
	type FilterControlId,
	type FilterHeader,
	type FilterState,
} from "./components/filter-header.ts";
import { openMultiSelectFilterPopup, openSingleSelectFilterPopup } from "./components/filter-popup.ts";
import { createGenericList, type GenericList } from "./components/generic-list.ts";
import { formatFooterContent } from "./footer-content.ts";
import { formatHeading } from "./heading.ts";
import { createLoadingScreen } from "./loading.ts";
import { formatStatusWithIcon, getStatusColor } from "./status-icon.ts";
import { createScreen } from "./tui.ts";

function getPriorityDisplay(priority?: "high" | "medium" | "low"): string {
	switch (priority) {
		case "high":
			return " {red-fg}●{/}";
		case "medium":
			return " {yellow-fg}●{/}";
		case "low":
			return " {green-fg}●{/}";
		default:
			return "";
	}
}

function createMilestoneLabelResolver(milestones: Milestone[]): (milestone: string) => string {
	const milestoneLabelsByKey = new Map<string, string>();
	for (const milestone of milestones) {
		const normalizedId = milestone.id.trim();
		const normalizedTitle = milestone.title.trim();
		if (!normalizedId || !normalizedTitle) continue;
		milestoneLabelsByKey.set(normalizedId.toLowerCase(), normalizedTitle);
		const idMatch = normalizedId.match(/^m-(\d+)$/i);
		if (idMatch?.[1]) {
			const numericAlias = String(Number.parseInt(idMatch[1], 10));
			milestoneLabelsByKey.set(`m-${numericAlias}`, normalizedTitle);
			milestoneLabelsByKey.set(numericAlias, normalizedTitle);
		}
		milestoneLabelsByKey.set(normalizedTitle.toLowerCase(), normalizedTitle);
	}

	return (milestone: string) => {
		const normalized = milestone.trim();
		if (!normalized) return milestone;
		return milestoneLabelsByKey.get(normalized.toLowerCase()) ?? milestone;
	};
}

export function buildStateViewerMilestoneFilterModel(activeMilestones: Milestone[]): {
	availableMilestoneTitles: string[];
	resolveMilestoneLabel: (milestone: string) => string;
} {
	return {
		availableMilestoneTitles: activeMilestones.map((milestone) => milestone.title),
		resolveMilestoneLabel: createMilestoneLabelResolver(activeMilestones),
	};
}

export type StateListBoundaryDirection = "up" | "down";
export type PendingSearchWrap = "to-first" | "to-last" | null;
type PaneFocus = "list" | "detail";

export function shouldMoveFromListBoundaryToSearch(
	direction: StateListBoundaryDirection,
	selectedIndex: number,
	totalStates: number,
): boolean {
	if (totalStates <= 0) {
		return false;
	}
	if (direction === "up") {
		return selectedIndex <= 0;
	}
	return selectedIndex >= totalStates - 1;
}

export function shouldMoveFromDetailBoundaryToSearch(
	direction: StateListBoundaryDirection,
	scrollOffset: number,
): boolean {
	if (direction !== "up") {
		return false;
	}
	return scrollOffset <= 0;
}

export function resolveSearchExitTargetIndex(
	direction: "up" | "down" | "escape",
	pendingWrap: PendingSearchWrap,
	totalStates: number,
	currentIndex: number | undefined,
): number | undefined {
	if (totalStates <= 0) {
		return undefined;
	}
	if (direction === "up" && pendingWrap === "to-last") {
		return totalStates - 1;
	}
	if (direction === "down" && pendingWrap === "to-first") {
		return 0;
	}
	return currentIndex;
}

export function resolveFilterExitPane(
	preferredPane: PaneFocus,
	hasStateList: boolean,
	hasDetailPane: boolean,
): PaneFocus | null {
	if (preferredPane === "detail" && hasDetailPane) {
		return "detail";
	}
	if (hasStateList) {
		return "list";
	}
	if (hasDetailPane) {
		return "detail";
	}
	return null;
}

/**
 * Display state details with search/filter header UI
 */
export async function viewStateEnhanced(
	state: State,
	options: {
		states?: State[];
		core?: Core;
		title?: string;
		filterDescription?: string;
		searchQuery?: string;
		statusFilter?: string;
		priorityFilter?: string;
		milestoneFilter?: string;
		labelFilter?: string[];
		startWithDetailFocus?: boolean;
		startWithSearchFocus?: boolean;
		viewSwitcher?: import("./view-switcher.ts").ViewSwitcher;
		onStateChange?: (state: State) => void;
		onTabPress?: () => Promise<void>;
		onFilterChange?: (filters: {
			searchQuery: string;
			statusFilter: string;
			priorityFilter: string;
			labelFilter: string[];
			milestoneFilter: string;
		}) => void;
	} = {},
): Promise<void> {
	if (output.isTTY === false) {
		console.log(formatStatePlainText(state));
		return;
	}

	// Get project root and setup services
	const cwd = process.cwd();
	const core = options.core || new Core(cwd, { enableWatchers: true });

	// Show loading screen while loading states (can be slow with cross-branch loading)
	let allStates: State[];
	let statuses: string[];
	let labels: string[];
	let availableLabels: string[] = [];
	// When states are provided, use in-memory search; otherwise use ContentStore-backed search
	let stateSearchIndex: ReturnType<typeof createStateSearchIndex> | null = null;
	let searchService: Awaited<ReturnType<typeof core.getSearchService>> | null = null;
	let contentStore: Awaited<ReturnType<typeof core.getContentStore>> | null = null;
	const milestoneEntities = await core.filesystem.listMilestones();
	const { availableMilestoneTitles, resolveMilestoneLabel } = buildStateViewerMilestoneFilterModel(milestoneEntities);

	if (options.states) {
		// States already provided - use in-memory search (no ContentStore loading)
		allStates = options.states.filter((t) => t.id && t.id.trim() !== "" && hasAnyPrefix(t.id));
		const config = await core.filesystem.loadConfig();
		statuses = config?.statuses || ["To Do", "In Progress", "Done"];
		labels = config?.labels || [];
		stateSearchIndex = createStateSearchIndex(allStates);
	} else {
		// Need to load states - show loading screen
		const loadingScreen = await createLoadingScreen("Loading states");
		try {
			loadingScreen?.update("Loading configuration...");
			const config = await core.filesystem.loadConfig();
			statuses = config?.statuses || ["To Do", "In Progress", "Done"];
			labels = config?.labels || [];

			loadingScreen?.update("Loading states from branches...");
			contentStore = await core.getContentStore();
			searchService = await core.getSearchService();

			loadingScreen?.update("Preparing state list...");
			const states = await core.queryStates();
			allStates = states.filter((t) => t.id && t.id.trim() !== "" && hasAnyPrefix(t.id));
		} finally {
			await loadingScreen?.close();
		}
	}

	// Collect available labels from config and states
	availableLabels = collectAvailableLabels(allStates, labels);

	// State for filtering - normalize filters to match configured values
	let searchQuery = options.searchQuery || "";

	// Find the canonical status value from configured statuses (case-insensitive)
	let statusFilter = "";
	if (options.statusFilter) {
		const lowerFilter = options.statusFilter.toLowerCase();
		const matchedStatus = statuses.find((s) => s.toLowerCase() === lowerFilter);
		statusFilter = matchedStatus || "";
	}

	// Priority is already lowercase
	let priorityFilter = options.priorityFilter || "";
	let labelFilter: string[] = [];
	let milestoneFilter = options.milestoneFilter || "";
	let filteredStates = [...allStates];

	if (options.labelFilter && options.labelFilter.length > 0) {
		const availableSet = new Set(availableLabels.map((label) => label.toLowerCase()));
		labelFilter = options.labelFilter.filter((label) => availableSet.has(label.toLowerCase()));
	}

	const filtersActive = Boolean(
		searchQuery || statusFilter || priorityFilter || labelFilter.length > 0 || milestoneFilter,
	);
	let requireInitialFilterSelection = filtersActive;

	const enrichState = (candidate: State | null): State | null => {
		if (!candidate) return null;
		return attachSubstateSummaries(candidate, allStates);
	};

	// Find the initial selected state
	let currentSelectedState = enrichState(state) ?? state;
	let selectionRequestId = 0;
	let noResultsMessage: string | null = null;

	const screen = createScreen({ title: options.title || "Roadmap States" });

	// Main container
	const container = box({
		parent: screen,
		width: "100%",
		height: "100%",
	});

	// State for tracking focus
	let currentFocus: "filters" | "list" | "detail" = "list";
	let filterPopupOpen = false;
	let pendingSearchWrap: PendingSearchWrap = null;
	let filterExitPane: PaneFocus = "list";

	// Create filter header component
	let filterHeader: FilterHeader;

	const focusFilterControl = (filterId: FilterControlId) => {
		switch (filterId) {
			case "search":
				filterHeader.focusSearch();
				break;
			case "status":
				filterHeader.focusStatus();
				break;
			case "priority":
				filterHeader.focusPriority();
				break;
			case "milestone":
				filterHeader.focusMilestone();
				break;
			case "labels":
				filterHeader.focusLabels();
				break;
		}
	};

	const openFilterPicker = async (filterId: Exclude<FilterControlId, "search">) => {
		if (filterPopupOpen) {
			return;
		}
		filterPopupOpen = true;

		try {
			if (filterId === "labels") {
				const nextLabels = await openMultiSelectFilterPopup({
					screen,
					title: "Label Filter",
					items: [...availableLabels].sort((a, b) => a.localeCompare(b)),
					selectedItems: labelFilter,
				});
				if (nextLabels !== null) {
					labelFilter = nextLabels;
					filterHeader.setFilters({ labels: nextLabels });
					applyFilters();
					notifyFilterChange();
				}
				return;
			}

			if (filterId === "status") {
				const selected = await openSingleSelectFilterPopup({
					screen,
					title: "Status Filter",
					selectedValue: statusFilter,
					choices: [{ label: "All", value: "" }, ...statuses.map((status) => ({ label: status, value: status }))],
				});
				if (selected !== null) {
					statusFilter = selected;
					filterHeader.setFilters({ status: selected });
					applyFilters();
					notifyFilterChange();
				}
				return;
			}

			if (filterId === "priority") {
				const priorities = ["high", "medium", "low"];
				const selected = await openSingleSelectFilterPopup({
					screen,
					title: "Priority Filter",
					selectedValue: priorityFilter,
					choices: [
						{ label: "All", value: "" },
						...priorities.map((priority) => ({ label: priority, value: priority })),
					],
				});
				if (selected !== null) {
					priorityFilter = selected;
					filterHeader.setFilters({ priority: selected });
					applyFilters();
					notifyFilterChange();
				}
				return;
			}

			const selected = await openSingleSelectFilterPopup({
				screen,
				title: "Milestone Filter",
				selectedValue: milestoneFilter,
				choices: [
					{ label: "All", value: "" },
					...availableMilestoneTitles.map((milestone) => ({ label: milestone, value: milestone })),
				],
			});
			if (selected !== null) {
				milestoneFilter = selected;
				filterHeader.setFilters({ milestone: selected });
				applyFilters();
				notifyFilterChange();
			}
		} finally {
			filterPopupOpen = false;
			focusFilterControl(filterId);
			screen.render();
		}
	};

	filterHeader = createFilterHeader({
		parent: container,
		statuses,
		availableLabels,
		availableMilestones: availableMilestoneTitles,
		initialFilters: {
			search: searchQuery,
			status: statusFilter,
			priority: priorityFilter,
			labels: labelFilter,
			milestone: milestoneFilter,
		},
		onFilterChange: (filters: FilterState) => {
			searchQuery = filters.search;
			statusFilter = filters.status;
			priorityFilter = filters.priority;
			labelFilter = filters.labels;
			milestoneFilter = filters.milestone;
			applyFilters();
			notifyFilterChange();
		},
		onFilterPickerOpen: (filterId) => {
			void openFilterPicker(filterId);
		},
	});

	// Handle focus changes from filter header
	filterHeader.setFocusChangeHandler((focus) => {
		if (focus !== null) {
			if (currentFocus !== "filters") {
				filterExitPane = currentFocus === "detail" ? "detail" : "list";
			}
			currentFocus = "filters";
			setActivePane("none");
			updateHelpBar();
		}
	});
	filterHeader.setExitRequestHandler((direction) => {
		filterHeader.setBorderColor("cyan");
		const targetPane = resolveFilterExitPane(filterExitPane, Boolean(stateList), Boolean(descriptionBox));
		if (targetPane === "list" && stateList) {
			const selected = stateList.getSelectedIndex();
			const currentIndex = Array.isArray(selected) ? selected[0] : selected;
			const targetIndex = resolveSearchExitTargetIndex(
				direction,
				pendingSearchWrap,
				filteredStates.length,
				currentIndex,
			);
			focusStateList(targetIndex);
		} else if (targetPane === "detail" && descriptionBox) {
			focusDetailPane();
		}
		pendingSearchWrap = null;
	});

	// Get dynamic header height
	const getHeaderHeight = () => filterHeader.getHeight();

	// State list pane (left 40%)
	const stateListPane = box({
		parent: container,
		top: getHeaderHeight(),
		left: 0,
		width: "40%",
		height: `100%-${getHeaderHeight() + 1}`,
		border: { type: "line" },
		style: { border: { fg: "gray" } },
		label: `\u00A0States (${filteredStates.length})\u00A0`,
	});

	// Detail pane - use right: 0 to ensure it extends to window edge
	const detailPane = box({
		parent: container,
		top: getHeaderHeight(),
		left: "40%",
		right: 0,
		height: `100%-${getHeaderHeight() + 1}`,
		border: { type: "line" },
		style: { border: { fg: "gray" } },
		label: "\u00A0Details\u00A0",
	});

	// Help bar at bottom
	const helpBar = box({
		parent: container,
		bottom: 0,
		left: 0,
		width: "100%",
		height: 1,
		tags: true,
		wrap: true,
		content: "",
	});
	let transientHelpContent: string | null = null;
	let helpRestoreTimer: ReturnType<typeof setTimeout> | null = null;

	function showTransientHelp(message: string, durationMs = 3000) {
		transientHelpContent = message;
		if (helpRestoreTimer) {
			clearTimeout(helpRestoreTimer);
			helpRestoreTimer = null;
		}
		updateHelpBar();
		helpRestoreTimer = setTimeout(() => {
			transientHelpContent = null;
			helpRestoreTimer = null;
			updateHelpBar();
		}, durationMs);
	}

	function getTerminalWidth(): number {
		return typeof screen.width === "number" ? screen.width : 80;
	}

	function syncPaneLayout() {
		const headerHeight = filterHeader.getHeight();
		const footerHeight = typeof helpBar.height === "number" ? helpBar.height : 1;
		stateListPane.top = headerHeight;
		stateListPane.height = `100%-${headerHeight + footerHeight}`;
		detailPane.top = headerHeight;
		detailPane.height = `100%-${headerHeight + footerHeight}`;
	}

	function setHelpBarContent(content: string) {
		const formatted = formatFooterContent(content, getTerminalWidth());
		helpBar.height = formatted.height;
		helpBar.setContent(formatted.content);
		syncPaneLayout();
	}

	function setActivePane(active: "list" | "detail" | "none") {
		const listBorder = stateListPane.style as { border?: { fg?: string } };
		const detailBorder = detailPane.style as { border?: { fg?: string } };
		if (listBorder.border) listBorder.border.fg = active === "list" ? "yellow" : "gray";
		if (detailBorder.border) detailBorder.border.fg = active === "detail" ? "yellow" : "gray";
	}

	function focusStateList(targetIndex?: number): void {
		if (!stateList) {
			if (descriptionBox) {
				currentFocus = "detail";
				setActivePane("detail");
				descriptionBox.focus();
				updateHelpBar();
				screen.render();
			}
			return;
		}
		currentFocus = "list";
		setActivePane("list");
		if (typeof targetIndex === "number") {
			stateList.setSelectedIndex(targetIndex);
		}
		stateList.focus();
		updateHelpBar();
		screen.render();
	}

	function focusDetailPane(): void {
		if (!descriptionBox) return;
		currentFocus = "detail";
		setActivePane("detail");
		descriptionBox.focus();
		updateHelpBar();
		screen.render();
	}

	// Helper to notify filter changes
	function notifyFilterChange() {
		if (options.onFilterChange) {
			options.onFilterChange({
				searchQuery,
				statusFilter,
				priorityFilter,
				labelFilter,
				milestoneFilter,
			});
		}
	}

	// Function to apply filters and refresh the state list
	function applyFilters() {
		const hasActiveFilters = Boolean(
			searchQuery.trim() || statusFilter || priorityFilter || labelFilter.length > 0 || milestoneFilter,
		);
		if (!hasActiveFilters) {
			filteredStates = [...allStates];
		} else if (stateSearchIndex) {
			filteredStates = applyStateFilters(
				allStates,
				{
					query: searchQuery,
					status: statusFilter || undefined,
					priority: priorityFilter as "high" | "medium" | "low" | undefined,
					labels: labelFilter,
					milestone: milestoneFilter || undefined,
					resolveMilestoneLabel,
				},
				stateSearchIndex,
			);
		} else if (searchService) {
			const searchResults = searchService.search({
				query: searchQuery,
				filters: {
					status: statusFilter || undefined,
					priority: priorityFilter as "high" | "medium" | "low" | undefined,
					labels: labelFilter.length > 0 ? labelFilter : undefined,
				},
				types: ["state"],
			});
			filteredStates = searchResults.filter((r): r is StateSearchResult => r.type === "state").map((r) => r.state);
			if (milestoneFilter) {
				filteredStates = filteredStates.filter((state) => {
					if (!state.milestone) return false;
					const stateMilestoneTitle = resolveMilestoneLabel(state.milestone);
					return stateMilestoneTitle.toLowerCase() === milestoneFilter.toLowerCase();
				});
			}
		} else {
			filteredStates = [...allStates];
		}

		// Update the state list label
		if (stateListPane.setLabel) {
			stateListPane.setLabel(`\u00A0States (${filteredStates.length})\u00A0`);
		}

		if (filteredStates.length === 0) {
			if (stateList) {
				stateList.destroy();
				stateList = null;
			}
			const activeFilters: string[] = [];
			const trimmedQuery = searchQuery.trim();
			if (trimmedQuery) {
				activeFilters.push(`Search: {cyan-fg}${trimmedQuery}{/}`);
			}
			if (statusFilter) {
				activeFilters.push(`Status: {cyan-fg}${statusFilter}{/}`);
			}
			if (priorityFilter) {
				activeFilters.push(`Priority: {cyan-fg}${priorityFilter}{/}`);
			}
			if (labelFilter.length > 0) {
				activeFilters.push(`Labels: {yellow-fg}${labelFilter.join(", ")}{/}`);
			}
			if (milestoneFilter) {
				activeFilters.push(`Milestone: {magenta-fg}${milestoneFilter}{/}`);
			}
			let listPaneMessage: string;
			if (activeFilters.length > 0) {
				noResultsMessage = `{bold}No states match your current filters{/bold}\n${activeFilters.map((f) => ` • ${f}`).join("\n")}\n\n{gray-fg}Try adjusting the search or clearing filters.{/}`;
				listPaneMessage = `{bold}No matching states{/bold}\n\n${activeFilters.map((f) => ` • ${f}`).join("\n")}`;
			} else {
				noResultsMessage =
					"{bold}No states available{/bold}\n{gray-fg}Create a state with {cyan-fg}roadmap state create{/cyan-fg}.{/}";
				listPaneMessage = "{bold}No states available{/bold}";
			}
			showListEmptyState(listPaneMessage);
			refreshDetailPane();
			screen.render();
			return;
		}

		noResultsMessage = null;
		hideListEmptyState();

		if (stateList) {
			stateList.destroy();
			stateList = null;
		}
		const listController = createStateList();
		stateList = listController;
		if (listController) {
			const forceFirst = requireInitialFilterSelection;
			let desiredIndex = filteredStates.findIndex((t) => t.id === currentSelectedState.id);
			if (forceFirst || desiredIndex < 0) {
				desiredIndex = 0;
			}
			const currentIndexRaw = listController.getSelectedIndex();
			const currentIndex = Array.isArray(currentIndexRaw) ? (currentIndexRaw[0] ?? 0) : currentIndexRaw;
			if (forceFirst || currentIndex !== desiredIndex) {
				listController.setSelectedIndex(desiredIndex);
			}
			requireInitialFilterSelection = false;
		}

		// Ensure detail pane is refreshed when transitioning from no-results to results
		refreshDetailPane();
		screen.render();
	}

	// State list component
	let stateList: GenericList<State> | null = null;
	let listEmptyStateBox: BoxInterface | null = null;

	function showListEmptyState(message: string) {
		if (listEmptyStateBox) {
			listEmptyStateBox.destroy();
		}
		listEmptyStateBox = box({
			parent: stateListPane,
			top: 1,
			left: 1,
			width: "100%-4",
			height: "100%-3",
			content: message,
			tags: true,
			style: { fg: "gray" },
		});
	}

	function hideListEmptyState() {
		if (listEmptyStateBox) {
			listEmptyStateBox.destroy();
			listEmptyStateBox = null;
		}
	}

	async function applySelection(selectedState: State | null) {
		if (!selectedState) return;
		if (currentSelectedState && selectedState.id === currentSelectedState.id) {
			return;
		}
		const enriched = enrichState(selectedState);
		currentSelectedState = enriched ?? selectedState;
		options.onStateChange?.(currentSelectedState);
		const requestId = ++selectionRequestId;
		refreshDetailPane();
		screen.render();
		const refreshed = await core.getStateWithSubstates(selectedState.id, allStates);
		if (requestId !== selectionRequestId) {
			return;
		}
		if (refreshed) {
			currentSelectedState = refreshed;
			options.onStateChange?.(refreshed);
		}
		refreshDetailPane();
		screen.render();
	}

	function createStateList(): GenericList<State> | null {
		const initialIndex = Math.max(
			0,
			filteredStates.findIndex((t) => t.id === currentSelectedState.id),
		);

		stateList = createGenericList<State>({
			parent: stateListPane,
			title: "",
			items: filteredStates,
			selectedIndex: initialIndex,
			border: false,
			top: 1,
			left: 1,
			width: "100%-4",
			height: "100%-3",
			itemRenderer: (state: State) => {
				const statusIcon = formatStatusWithIcon(state.status);
				const statusColor = getStatusColor(state.status);
				const assigneeText = state.assignee?.length
					? ` {cyan-fg}${state.assignee[0]?.startsWith("@") ? state.assignee[0] : `@${state.assignee[0]}`}{/}`
					: "";
				const labelsText = state.labels?.length ? ` {yellow-fg}[${state.labels.join(", ")}]{/}` : "";
				const priorityText = getPriorityDisplay(state.priority);
				const isCrossBranch = Boolean((state as State & { branch?: string }).branch);
				const branchText = isCrossBranch ? ` {green-fg}(${(state as State & { branch?: string }).branch}){/}` : "";

				const content = `{${statusColor}-fg}${statusIcon}{/} {bold}${state.id}{/bold} - ${state.title}${priorityText}${assigneeText}${labelsText}${branchText}`;
				// Dim cross-branch states to indicate read-only status
				return isCrossBranch ? `{gray-fg}${content}{/}` : content;
			},
			onSelect: (selected: State | State[]) => {
				const selectedState = Array.isArray(selected) ? selected[0] : selected;
				void applySelection(selectedState || null);
			},
			onHighlight: (selected: State | null) => {
				void applySelection(selected);
			},
			onBoundaryNavigation: (direction, selectedIndex, total) => {
				if (!shouldMoveFromListBoundaryToSearch(direction, selectedIndex, total)) {
					return false;
				}
				pendingSearchWrap = direction === "up" ? "to-last" : "to-first";
				filterHeader.focusSearch();
				return true;
			},
			showHelp: false,
		});

		// Focus handler for state list
		if (stateList) {
			const listBox = stateList.getListBox();
			listBox.on("focus", () => {
				currentFocus = "list";
				setActivePane("list");
				screen.render();
				updateHelpBar();
			});
			listBox.on("blur", () => {
				setActivePane("none");
				screen.render();
			});
			listBox.key(["right", "l"], () => {
				focusDetailPane();
				return false;
			});
		}

		return stateList;
	}

	// Detail pane refresh function
	let headerDetailBox: BoxInterface | undefined;
	let divider: LineInterface | undefined;
	let descriptionBox: ScrollableTextInterface | undefined;

	function refreshDetailPane() {
		if (headerDetailBox) headerDetailBox.destroy();
		if (divider) divider.destroy();
		if (descriptionBox) descriptionBox.destroy();

		const configureDetailBox = (boxInstance: ScrollableTextInterface) => {
			descriptionBox = boxInstance;
			const scrollable = boxInstance as unknown as {
				scroll?: (offset: number) => void;
				setScroll?: (offset: number) => void;
				setScrollPerc?: (perc: number) => void;
				getScroll?: () => number;
			};

			const pageAmount = () => {
				const height = typeof boxInstance.height === "number" ? boxInstance.height : 0;
				return height > 0 ? Math.max(1, height - 3) : 0;
			};

			boxInstance.key(["up", "k"], () => {
				if (!shouldMoveFromDetailBoundaryToSearch("up", scrollable.getScroll?.() ?? 0)) {
					return true;
				}
				pendingSearchWrap = null;
				filterHeader.focusSearch();
				return false;
			});

			boxInstance.key(["pageup", "b"], () => {
				const delta = pageAmount();
				if (delta > 0) {
					scrollable.scroll?.(-delta);
					screen.render();
				}
				return false;
			});
			boxInstance.key(["pagedown", "space"], () => {
				const delta = pageAmount();
				if (delta > 0) {
					scrollable.scroll?.(delta);
					screen.render();
				}
				return false;
			});
			boxInstance.key(["home", "g"], () => {
				scrollable.setScroll?.(0);
				screen.render();
				return false;
			});
			boxInstance.key(["end", "G"], () => {
				scrollable.setScrollPerc?.(100);
				screen.render();
				return false;
			});
			boxInstance.on("focus", () => {
				currentFocus = "detail";
				setActivePane("detail");
				updateHelpBar();
				screen.render();
			});
			boxInstance.on("blur", () => {
				if (currentFocus !== "detail") {
					setActivePane(currentFocus === "list" ? "list" : "none");
					screen.render();
				}
			});
			boxInstance.key(["left", "h"], () => {
				focusStateList();
				return false;
			});
			boxInstance.key(["escape"], () => {
				focusStateList();
				return false;
			});
			if (currentFocus === "detail") {
				setImmediate(() => boxInstance.focus());
			}
		};

		if (noResultsMessage) {
			screen.title = options.title || "Roadmap States";

			headerDetailBox = box({
				parent: detailPane,
				top: 0,
				left: 1,
				right: 1,
				height: "shrink",
				tags: true,
				wrap: true,
				scrollable: false,
				padding: { left: 1, right: 1 },
				content: "{bold}No states to display{/bold}",
			});

			descriptionBox = undefined;
			divider = undefined;
			const messageBox = scrollabletext({
				parent: detailPane,
				top: (typeof headerDetailBox.bottom === "number" ? headerDetailBox.bottom : 0) + 1,
				left: 1,
				right: 1,
				bottom: 1,
				keys: true,
				vi: true,
				mouse: true,
				tags: true,
				wrap: true,
				padding: { left: 1, right: 1, top: 0, bottom: 0 },
				content: noResultsMessage,
			});

			configureDetailBox(messageBox);
			screen.render();
			return;
		}

		screen.title = `State ${currentSelectedState.id} - ${currentSelectedState.title}`;

		const detailContent = generateDetailContent(currentSelectedState, resolveMilestoneLabel);

		// Calculate header height based on content and available width
		const detailPaneWidth = typeof detailPane.width === "number" ? detailPane.width : 60;
		const availableWidth = detailPaneWidth - 6; // 2 for border, 2 for box padding, 2 for header padding

		let headerLineCount = 0;
		for (const detailLine of detailContent.headerContent) {
			const plainText = detailLine.replace(/\{[^}]+\}/g, "");
			const lineCount = Math.max(1, Math.ceil(plainText.length / availableWidth));
			headerLineCount += lineCount;
		}

		headerDetailBox = box({
			parent: detailPane,
			top: 0,
			left: 1,
			right: 1,
			height: headerLineCount,
			tags: true,
			wrap: true,
			scrollable: false,
			padding: { left: 1, right: 1 },
			content: detailContent.headerContent.join("\n"),
		});

		divider = line({
			parent: detailPane,
			top: headerLineCount,
			left: 1,
			right: 1,
			orientation: "horizontal",
			style: { fg: "gray" },
		});

		const bodyContainer = scrollabletext({
			parent: detailPane,
			top: headerLineCount + 1,
			left: 1,
			right: 1,
			bottom: 1,
			keys: true,
			vi: true,
			mouse: true,
			tags: true,
			wrap: true,
			padding: { left: 1, right: 1, top: 0, bottom: 0 },
			content: detailContent.bodyContent.join("\n"),
		});

		configureDetailBox(bodyContainer);
	}

	// Dynamic help bar content
	function updateHelpBar() {
		if (transientHelpContent) {
			setHelpBarContent(transientHelpContent);
			screen.render();
			return;
		}

		let content = "";

		const filterFocus = filterHeader.getCurrentFocus();
		if (currentFocus === "filters" && filterFocus) {
			if (filterFocus === "search") {
				content =
					" {cyan-fg}[←/→]{/} Cursor (edge=Prev/Next) | {cyan-fg}[↑/↓]{/} Back to States | {cyan-fg}[Esc]{/} Cancel | {gray-fg}(Live search){/}";
			} else {
				content = " {cyan-fg}[Enter/Space]{/} Open Picker | {cyan-fg}[←/→]{/} Prev/Next | {cyan-fg}[Esc]{/} Back";
			}
		} else if (currentFocus === "detail") {
			content =
				" {cyan-fg}[Tab]{/} Switch View | {cyan-fg}[←]{/} State List | {cyan-fg}[↑↓]{/} Scroll | {cyan-fg}[E]{/} Edit | {cyan-fg}[q/Esc]{/} Quit";
		} else {
			// State list help
			content =
				" {cyan-fg}[Tab]{/} Switch View | {cyan-fg}[/]{/} Search | {cyan-fg}[s]{/} Status | {cyan-fg}[p]{/} Priority | {cyan-fg}[i]{/} Milestone | {cyan-fg}[l]{/} Labels | {cyan-fg}[↑↓]{/} Navigate | {cyan-fg}[E]{/} Edit | {cyan-fg}[q/Esc]{/} Quit";
		}

		setHelpBarContent(content);
		screen.render();
	}

	const openCurrentStateInEditor = async () => {
		if (filterPopupOpen || currentFocus === "filters" || noResultsMessage) {
			return;
		}
		const selectedState = currentSelectedState;

		try {
			const result = await core.editStateInTui(selectedState.id, screen, selectedState);
			if (result.reason === "read_only") {
				const branchInfo = result.state?.branch ? ` in branch ${result.state.branch}` : "";
				showTransientHelp(` {red-fg}State is read-only${branchInfo}.{/}`);
				return;
			}
			if (result.reason === "editor_failed") {
				showTransientHelp(" {red-fg}Editor exited with an error; state was not modified.{/}");
				return;
			}
			if (result.reason === "not_found") {
				showTransientHelp(` {red-fg}State ${selectedState.id} was not found on this branch.{/}`);
				return;
			}

			if (result.state) {
				const index = allStates.findIndex((stateItem) => stateItem.id === selectedState.id);
				if (index >= 0) {
					allStates[index] = result.state;
				}
				const enhancedState = enrichState(result.state) ?? result.state;
				currentSelectedState = enhancedState;
				options.onStateChange?.(enhancedState);
				if (stateSearchIndex) {
					stateSearchIndex = createStateSearchIndex(allStates);
				}
			}

			applyFilters();
			if (result.changed) {
				showTransientHelp(` {green-fg}State ${result.state?.id ?? selectedState.id} marked modified.{/}`);
				return;
			}
			showTransientHelp(` {gray-fg}No changes detected for ${result.state?.id ?? selectedState.id}.{/}`);
		} catch (_error) {
			showTransientHelp(" {red-fg}Failed to open editor.{/}");
		}
	};

	// Handle resize
	screen.on("resize", () => {
		filterHeader.rebuild();
		updateHelpBar();
	});

	// Keyboard shortcuts
	screen.key(["/"], () => {
		pendingSearchWrap = null;
		filterHeader.focusSearch();
	});

	screen.key(["C-f"], () => {
		pendingSearchWrap = null;
		filterHeader.focusSearch();
	});

	screen.key(["s", "S"], () => {
		void openFilterPicker("status");
	});

	screen.key(["p", "P"], () => {
		void openFilterPicker("priority");
	});

	screen.key(["l", "L"], () => {
		void openFilterPicker("labels");
	});

	screen.key(["i", "I"], () => {
		void openFilterPicker("milestone");
	});

	screen.key(["e", "E", "S-e"], () => {
		void openCurrentStateInEditor();
	});

	screen.key(["escape"], () => {
		if (filterPopupOpen) {
			return;
		}
		if (currentFocus === "filters") {
			filterHeader.setBorderColor("cyan");
			const targetPane = resolveFilterExitPane(filterExitPane, Boolean(stateList), Boolean(descriptionBox));
			if (targetPane === "list" && stateList) {
				focusStateList();
			} else if (targetPane === "detail" && descriptionBox) {
				focusDetailPane();
			}
		} else if (currentFocus !== "list") {
			if (stateList) {
				focusStateList();
			}
		} else {
			// If already in state list, quit
			searchService?.dispose();
			contentStore?.dispose();
			filterHeader.destroy();
			screen.destroy();
			process.exit(0);
		}
	});

	// Tab key handling for view switching - only when in state list
	if (options.onTabPress) {
		screen.key(["tab"], async () => {
			// Keep tab as filter-navigation while filters are focused.
			if (filterPopupOpen || currentFocus === "filters") {
				return;
			}
			if (currentFocus === "list" || currentFocus === "detail") {
				// Cleanup before switching
				searchService?.dispose();
				contentStore?.dispose();
				filterHeader.destroy();
				screen.destroy();
				await options.onTabPress?.();
			}
		});
	}

	// Quit handlers
	screen.key(["q", "C-c"], () => {
		if (filterPopupOpen) {
			return;
		}
		searchService?.dispose();
		contentStore?.dispose();
		filterHeader.destroy();
		screen.destroy();
		process.exit(0);
	});

	// Initial setup
	updateHelpBar();

	// Apply filters first if any are set
	if (filtersActive) {
		applyFilters();
	} else {
		stateList = createStateList();
	}
	refreshDetailPane();

	if (options.startWithSearchFocus) {
		filterHeader.focusSearch();
	} else if (options.startWithDetailFocus) {
		if (descriptionBox) {
			focusDetailPane();
		}
	} else {
		// Focus the state list initially and highlight it
		if (stateList) {
			focusStateList();
		}
	}

	screen.render();

	// Wait for screen to close
	return new Promise<void>((resolve) => {
		screen.on("destroy", () => {
			if (helpRestoreTimer) {
				clearTimeout(helpRestoreTimer);
				helpRestoreTimer = null;
			}
			searchService?.dispose();
			contentStore?.dispose();
			resolve();
		});
	});
}

function generateDetailContent(
	state: State,
	resolveMilestoneLabel?: (milestone: string) => string,
): { headerContent: string[]; bodyContent: string[] } {
	const headerContent = [
		` {${getStatusColor(state.status)}-fg}${formatStatusWithIcon(state.status)}{/} {bold}{blue-fg}${state.id}{/blue-fg}{/bold} - ${state.title}`,
	];

	// Add cross-branch indicator if state is from another branch
	const isCrossBranch = Boolean((state as State & { branch?: string }).branch);
	if (isCrossBranch) {
		const branchName = (state as State & { branch?: string }).branch;
		headerContent.push(
			` {yellow-fg}⚠ Read-only:{/} This state exists in branch {green-fg}${branchName}{/}. Switch to that branch to edit it.`,
		);
	}

	const bodyContent: string[] = [];
	bodyContent.push(formatHeading("Details", 2));

	const metadata: string[] = [];
	metadata.push(`{bold}Created:{/bold} ${formatDateForDisplay(state.createdDate)}`);
	if (state.updatedDate && state.updatedDate !== state.createdDate) {
		metadata.push(`{bold}Updated:{/bold} ${formatDateForDisplay(state.updatedDate)}`);
	}
	if (state.priority) {
		const priorityDisplay = getPriorityDisplay(state.priority);
		const priorityText = state.priority.charAt(0).toUpperCase() + state.priority.slice(1);
		metadata.push(`{bold}Priority:{/bold} ${priorityText}${priorityDisplay}`);
	}
	if (state.assignee?.length) {
		const assigneeList = state.assignee.map((a) => (a.startsWith("@") ? a : `@${a}`)).join(", ");
		metadata.push(`{bold}Assignee:{/bold} {cyan-fg}${assigneeList}{/}`);
	}
	if (state.labels?.length) {
		metadata.push(`{bold}Labels:{/bold} ${state.labels.map((l) => `{yellow-fg}[${l}]{/}`).join(" ")}`);
	}
	if (state.reporter) {
		const reporterText = state.reporter.startsWith("@") ? state.reporter : `@${state.reporter}`;
		metadata.push(`{bold}Reporter:{/bold} {cyan-fg}${reporterText}{/}`);
	}
	if (state.milestone) {
		const milestoneLabel = resolveMilestoneLabel ? resolveMilestoneLabel(state.milestone) : state.milestone;
		metadata.push(`{bold}Milestone:{/bold} {magenta-fg}${milestoneLabel}{/}`);
	}
	if (state.parentStateId) {
		const parentLabel = state.parentStateTitle ? `${state.parentStateId} - ${state.parentStateTitle}` : state.parentStateId;
		metadata.push(`{bold}Parent:{/bold} {blue-fg}${parentLabel}{/}`);
	}
	if (state.substates?.length) {
		metadata.push(`{bold}Substates:{/bold} ${state.substates.length} state${state.substates.length > 1 ? "s" : ""}`);
	}
	if (state.dependencies?.length) {
		metadata.push(`{bold}Dependencies:{/bold} ${state.dependencies.join(", ")}`);
	}

	bodyContent.push(metadata.join("\n"));
	bodyContent.push("");

	bodyContent.push(formatHeading("Description", 2));
	const descriptionText = state.description?.trim();
	const descriptionContent = descriptionText
		? transformCodePaths(descriptionText)
		: "{gray-fg}No description provided{/}";
	bodyContent.push(descriptionContent);
	bodyContent.push("");

	if (state.references?.length) {
		bodyContent.push(formatHeading("References", 2));
		const formattedRefs = state.references.map((ref) => {
			// Color URLs differently from file paths
			if (ref.startsWith("http://") || ref.startsWith("https://")) {
				return `  {cyan-fg}${ref}{/}`;
			}
			return `  {yellow-fg}${ref}{/}`;
		});
		bodyContent.push(formattedRefs.join("\n"));
		bodyContent.push("");
	}

	if (state.documentation?.length) {
		bodyContent.push(formatHeading("Documentation", 2));
		const formattedDocs = state.documentation.map((doc) => {
			if (doc.startsWith("http://") || doc.startsWith("https://")) {
				return `  {cyan-fg}${doc}{/}`;
			}
			return `  {yellow-fg}${doc}{/}`;
		});
		bodyContent.push(formattedDocs.join("\n"));
		bodyContent.push("");
	}

	bodyContent.push(formatHeading("Acceptance Criteria", 2));
	const checklistItems = buildAcceptanceCriteriaItems(state);
	if (checklistItems.length > 0) {
		const formattedCriteria = checklistItems.map((item) =>
			formatChecklistItem(
				{
					text: transformCodePaths(item.text),
					checked: item.checked,
				},
				{
					padding: " ",
					checkedSymbol: "{green-fg}✓{/}",
					uncheckedSymbol: "{gray-fg}○{/}",
				},
			),
		);
		bodyContent.push(formattedCriteria.join("\n"));
	} else {
		bodyContent.push("{gray-fg}No acceptance criteria defined{/}");
	}
	bodyContent.push("");

	bodyContent.push(formatHeading("Definition of Done", 2));
	const definitionItems = buildDefinitionOfDoneItems(state);
	if (definitionItems.length > 0) {
		const formattedDefinition = definitionItems.map((item) =>
			formatChecklistItem(
				{
					text: transformCodePaths(item.text),
					checked: item.checked,
				},
				{
					padding: " ",
					checkedSymbol: "{green-fg}✓{/}",
					uncheckedSymbol: "{gray-fg}○{/}",
				},
			),
		);
		bodyContent.push(formattedDefinition.join("\n"));
	} else {
		bodyContent.push("{gray-fg}No Definition of Done items defined{/}");
	}
	bodyContent.push("");

	const implementationPlan = state.implementationPlan?.trim();
	if (implementationPlan) {
		bodyContent.push(formatHeading("Implementation Plan", 2));
		bodyContent.push(transformCodePaths(implementationPlan));
		bodyContent.push("");
	}

	const implementationNotes = state.implementationNotes?.trim();
	if (implementationNotes) {
		bodyContent.push(formatHeading("Implementation Notes", 2));
		bodyContent.push(transformCodePaths(implementationNotes));
		bodyContent.push("");
	}

	const finalSummary = state.finalSummary?.trim();
	if (finalSummary) {
		bodyContent.push(formatHeading("Final Summary", 2));
		bodyContent.push(transformCodePaths(finalSummary));
		bodyContent.push("");
	}

	return { headerContent, bodyContent };
}

export async function createStatePopup(
	screen: ScreenInterface,
	state: State,
	resolveMilestoneLabel?: (milestone: string) => string,
): Promise<{
	background: BoxInterface;
	popup: BoxInterface;
	contentArea: ScrollableTextInterface;
	close: () => void;
} | null> {
	if (output.isTTY === false) return null;

	const popup = box({
		parent: screen,
		top: "center",
		left: "center",
		width: "85%",
		height: "80%",
		border: "line",
		style: {
			border: { fg: "gray" },
		},
		keys: true,
		tags: true,
		autoPadding: true,
	});

	const background = box({
		parent: screen,
		top: Number(popup.top ?? 0) - 1,
		left: Number(popup.left ?? 0) - 2,
		width: Number(popup.width ?? 0) + 4,
		height: Number(popup.height ?? 0) + 2,
		style: {
			bg: "black",
		},
	});

	popup.setFront?.();

	const { headerContent, bodyContent } = generateDetailContent(state, resolveMilestoneLabel);

	// Calculate header height based on content and available width
	const popupWidth = typeof popup.width === "number" ? popup.width : 80;
	const availableWidth = popupWidth - 6;

	let headerLineCount = 0;
	for (const headerLine of headerContent) {
		const plainText = headerLine.replace(/\{[^}]+\}/g, "");
		const lineCount = Math.max(1, Math.ceil(plainText.length / availableWidth));
		headerLineCount += lineCount;
	}

	box({
		parent: popup,
		top: 0,
		left: 1,
		right: 1,
		height: headerLineCount,
		tags: true,
		wrap: true,
		scrollable: false,
		padding: { left: 1, right: 1 },
		content: headerContent.join("\n"),
	});

	line({
		parent: popup,
		top: headerLineCount,
		left: 1,
		right: 1,
		orientation: "horizontal",
		style: { fg: "gray" },
	});

	box({
		parent: popup,
		content: " Esc ",
		top: -1,
		right: 1,
		width: 5,
		height: 1,
		style: { fg: "white", bg: "blue" },
	});

	const contentArea = scrollabletext({
		parent: popup,
		top: headerLineCount + 1,
		left: 1,
		right: 1,
		bottom: 1,
		keys: true,
		vi: true,
		mouse: true,
		tags: true,
		wrap: true,
		padding: { left: 1, right: 1, top: 0, bottom: 0 },
		content: bodyContent.join("\n"),
	});

	const closePopup = () => {
		popup.destroy();
		background.destroy();
		screen.render();
	};

	popup.key(["escape", "q", "C-c"], () => {
		closePopup();
		return false;
	});

	contentArea.on("focus", () => {
		const popupStyle = popup.style as { border?: { fg?: string } };
		popupStyle.border = { ...(popupStyle.border ?? {}), fg: "yellow" };
		screen.render();
	});

	contentArea.on("blur", () => {
		const popupStyle = popup.style as { border?: { fg?: string } };
		popupStyle.border = { ...(popupStyle.border ?? {}), fg: "gray" };
		screen.render();
	});

	contentArea.key(["escape"], () => {
		closePopup();
		return false;
	});

	setImmediate(() => {
		contentArea.focus();
	});

	return {
		background,
		popup,
		contentArea,
		close: closePopup,
	};
}
