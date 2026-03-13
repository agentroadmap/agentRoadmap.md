import type { BoxInterface, ListInterface } from "neo-neo-bblessed";
import { box, list } from "neo-neo-bblessed";
import {
	type BoardLayout,
	buildKanbanStatusGroups,
	generateKanbanBoardWithMetadata,
	generateMilestoneGroupedBoard,
} from "../board.ts";
import { Core } from "../core/roadmap.ts";
import type { Milestone, State } from "../types/index.ts";
import { collectAvailableLabels } from "../utils/label-filter.ts";
import { applySharedStateFilters, createStateSearchIndex } from "../utils/state-search.ts";
import { compareStateIds } from "../utils/state-sorting.ts";
import { createFilterHeader, type FilterHeader, type FilterState } from "./components/filter-header.ts";
import { openMultiSelectFilterPopup, openSingleSelectFilterPopup } from "./components/filter-popup.ts";
import { formatFooterContent } from "./footer-content.ts";
import { getStatusIcon } from "./status-icon.ts";
import {
	createStatePopup,
	resolveSearchExitTargetIndex,
	shouldMoveFromListBoundaryToSearch,
} from "./state-viewer-with-search.ts";
import { createScreen } from "./tui.ts";

export type ColumnData = {
	status: string;
	states: State[];
};

type ColumnView = {
	status: string;
	states: State[];
	list: ListInterface;
	box: BoxInterface;
};

function isDoneStatus(status: string): boolean {
	const normalized = status.trim().toLowerCase();
	return normalized === "done" || normalized === "completed" || normalized === "complete";
}

function buildColumnStates(status: string, items: State[], byId: Map<string, State>): State[] {
	const topLevel: State[] = [];
	const childrenByParent = new Map<string, State[]>();
	const sorted = items.slice().sort((a, b) => {
		// Use ordinal for custom sorting if available
		const aOrd = a.ordinal;
		const bOrd = b.ordinal;

		// If both have ordinals, compare them
		if (typeof aOrd === "number" && typeof bOrd === "number") {
			if (aOrd !== bOrd) return aOrd - bOrd;
		} else if (typeof aOrd === "number") {
			// Only A has ordinal -> A comes first
			return -1;
		} else if (typeof bOrd === "number") {
			// Only B has ordinal -> B comes first
			return 1;
		}

		const columnIsDone = isDoneStatus(status);
		if (columnIsDone) {
			return compareStateIds(b.id, a.id);
		}

		return compareStateIds(a.id, b.id);
	});

	for (const state of sorted) {
		const parent = state.parentStateId ? byId.get(state.parentStateId) : undefined;
		if (parent && parent.status === state.status) {
			const existing = childrenByParent.get(parent.id) ?? [];
			existing.push(state);
			childrenByParent.set(parent.id, existing);
			continue;
		}
		topLevel.push(state);
	}

	const ordered: State[] = [];
	for (const state of topLevel) {
		ordered.push(state);
		const subs = childrenByParent.get(state.id) ?? [];
		subs.sort((a, b) => compareStateIds(a.id, b.id));
		ordered.push(...subs);
	}

	return ordered;
}

function prepareBoardColumns(states: State[], statuses: string[]): ColumnData[] {
	const { orderedStatuses, groupedStates } = buildKanbanStatusGroups(states, statuses);
	const byId = new Map<string, State>(states.map((state) => [state.id, state]));

	return orderedStatuses.map((status) => {
		const items = groupedStates.get(status) ?? [];
		const orderedStates = buildColumnStates(status, items, byId);
		return { status, states: orderedStates };
	});
}

function formatStateListItem(state: State, isMoving = false): string {
	const assignee = state.assignee?.[0]
		? ` {cyan-fg}${state.assignee[0].startsWith("@") ? state.assignee[0] : `@${state.assignee[0]}`}{/}`
		: "";
	const labels = state.labels?.length ? ` {yellow-fg}[${state.labels.join(", ")}]{/}` : "";
	const isCrossBranch = Boolean((state as State & { branch?: string }).branch);
	const branch = isCrossBranch ? ` {green-fg}(${(state as State & { branch?: string }).branch}){/}` : "";

	// Cross-branch states are dimmed to indicate read-only status
	const content = `{bold}${state.id}{/bold} - ${state.title}${assignee}${labels}${branch}`;
	if (isMoving) {
		return `{magenta-fg}► ${content}{/}`;
	}
	if (isCrossBranch) {
		return `{gray-fg}${content}{/}`;
	}
	return content;
}

function formatColumnLabel(status: string, count: number): string {
	return `\u00A0${getStatusIcon(status)} ${status || "No Status"} (${count})\u00A0`;
}

const DEFAULT_FOOTER_CONTENT =
	" {cyan-fg}[Tab]{/} Switch View | {cyan-fg}[/]{/} Search | {cyan-fg}[P]{/} Priority | {cyan-fg}[F]{/} Labels | {cyan-fg}[I]{/} Milestone | {cyan-fg}[←→]{/} Columns | {cyan-fg}[↑↓]{/} States | {cyan-fg}[Enter]{/} View | {cyan-fg}[E]{/} Edit | {cyan-fg}[M]{/} Move | {cyan-fg}[q/Esc]{/} Quit";

function _arraysEqual(left: string[], right: string[]): boolean {
	if (left.length !== right.length) return false;
	for (let index = 0; index < left.length; index += 1) {
		if (left[index] !== right[index]) return false;
	}
	return true;
}

export function shouldRebuildColumns(current: ColumnData[], next: ColumnData[]): boolean {
	if (current.length !== next.length) {
		return true;
	}
	for (let index = 0; index < next.length; index += 1) {
		const nextColumn = next[index];
		if (!nextColumn) return true;
		const prevColumn = current[index];
		if (!prevColumn) return true;
		if (prevColumn.status !== nextColumn.status) return true;
		if (prevColumn.states.length !== nextColumn.states.length) return true;
		for (let stateIdx = 0; stateIdx < nextColumn.states.length; stateIdx += 1) {
			const prevState = prevColumn.states[stateIdx];
			const nextState = nextColumn.states[stateIdx];
			if (!prevState || !nextState) {
				return true;
			}
			if (prevState.id !== nextState.id) {
				return true;
			}
		}
	}
	return false;
}

/**
 * Render states in an interactive TUI when stdout is a TTY.
 * Falls back to plain-text board when not in a terminal
 * (e.g. piping output to a file or running in CI).
 */
export async function renderBoardTui(
	initialStates: State[],
	statuses: string[],
	_layout: BoardLayout,
	_maxColumnWidth: number,
	options?: {
		viewSwitcher?: import("./view-switcher.ts").ViewSwitcher;
		onStateSelect?: (state: State) => void;
		onTabPress?: () => Promise<void>;
		subscribeUpdates?: (update: (nextStates: State[], nextStatuses: string[]) => void) => void;
		filters?: {
			searchQuery: string;
			priorityFilter: string;
			labelFilter: string[];
			milestoneFilter: string;
		};
		availableLabels?: string[];
		availableMilestones?: string[];
		onFilterChange?: (filters: {
			searchQuery: string;
			priorityFilter: string;
			labelFilter: string[];
			milestoneFilter: string;
		}) => void;
		milestoneMode?: boolean;
		milestoneEntities?: Milestone[];
	},
): Promise<void> {
	if (!process.stdout.isTTY) {
		if (options?.milestoneMode) {
			console.log(generateMilestoneGroupedBoard(initialStates, statuses, options.milestoneEntities ?? [], "Project"));
		} else {
			console.log(generateKanbanBoardWithMetadata(initialStates, statuses, "Project"));
		}
		return;
	}

	const initialColumns = prepareBoardColumns(initialStates, statuses);
	if (initialColumns.length === 0) {
		console.log("No states available for the Kanban board.");
		return;
	}

	await new Promise<void>((resolve) => {
		const screen = createScreen({ title: "Roadmap Board" });
		const container = box({
			parent: screen,
			width: "100%",
			height: "100%",
		});
		const boardArea = box({
			parent: container,
			top: 0,
			left: 0,
			width: "100%",
			height: "100%-1",
		});

		let currentStates = initialStates;
		let columns: ColumnView[] = [];
		let currentColumnsData = initialColumns;
		let currentStatuses = currentColumnsData.map((column) => column.status);
		let currentCol = 0;
		let popupOpen = false;
		let currentFocus: "board" | "filters" = "board";
		let filterPopupOpen = false;
		let pendingSearchWrap: "to-first" | "to-last" | null = null;
		const sharedFilters = {
			searchQuery: options?.filters?.searchQuery ?? "",
			priorityFilter: options?.filters?.priorityFilter ?? "",
			labelFilter: [...(options?.filters?.labelFilter ?? [])],
			milestoneFilter: options?.filters?.milestoneFilter ?? "",
		};
		let configuredLabels = collectAvailableLabels(initialStates, options?.availableLabels ?? []);
		let availableMilestones = [...(options?.availableMilestones ?? [])];
		const milestoneLabelByKey = new Map<string, string>();
		for (const milestone of options?.milestoneEntities ?? []) {
			const normalizedId = milestone.id.trim();
			const normalizedTitle = milestone.title.trim();
			if (!normalizedId || !normalizedTitle) continue;
			milestoneLabelByKey.set(normalizedId.toLowerCase(), normalizedTitle);
			const idMatch = normalizedId.match(/^m-(\d+)$/i);
			if (idMatch?.[1]) {
				const numericAlias = String(Number.parseInt(idMatch[1], 10));
				milestoneLabelByKey.set(`m-${numericAlias}`, normalizedTitle);
				milestoneLabelByKey.set(numericAlias, normalizedTitle);
			}
			milestoneLabelByKey.set(normalizedTitle.toLowerCase(), normalizedTitle);
		}
		const resolveMilestoneLabel = (milestone: string) => {
			const normalized = milestone.trim();
			if (!normalized) return milestone;
			return milestoneLabelByKey.get(normalized.toLowerCase()) ?? milestone;
		};
		availableMilestones = Array.from(
			new Set([
				...availableMilestones,
				...initialStates
					.map((state) => state.milestone?.trim())
					.filter((milestone): milestone is string => Boolean(milestone && milestone.length > 0))
					.map((milestone) => resolveMilestoneLabel(milestone)),
			]),
		).sort((a, b) => a.localeCompare(b));

		let filterHeader: FilterHeader | null = null;
		const hasActiveSharedFilters = () =>
			Boolean(
				sharedFilters.searchQuery.trim() ||
					sharedFilters.priorityFilter ||
					sharedFilters.labelFilter.length > 0 ||
					sharedFilters.milestoneFilter,
			);
		const emitFilterChange = () => {
			options?.onFilterChange?.({
				searchQuery: sharedFilters.searchQuery,
				priorityFilter: sharedFilters.priorityFilter,
				labelFilter: [...sharedFilters.labelFilter],
				milestoneFilter: sharedFilters.milestoneFilter,
			});
		};
		const getFilteredStates = (): State[] => {
			if (!hasActiveSharedFilters()) {
				return [...currentStates];
			}
			const searchIndex = createStateSearchIndex(currentStates);
			return applySharedStateFilters(
				currentStates,
				{
					query: sharedFilters.searchQuery,
					priority: sharedFilters.priorityFilter as "high" | "medium" | "low" | undefined,
					labels: sharedFilters.labelFilter,
					milestone: sharedFilters.milestoneFilter || undefined,
					resolveMilestoneLabel,
				},
				searchIndex,
			);
		};

		// Move mode state
		type MoveOperation = {
			stateId: string;
			originalStatus: string;
			originalIndex: number;
			targetStatus: string;
			targetIndex: number;
		};
		let moveOp: MoveOperation | null = null;

		const footerBox = box({
			parent: screen,
			bottom: 0,
			left: 0,
			height: 1,
			width: "100%",
			tags: true,
			wrap: true,
			content: "",
		});
		let transientFooterContent: string | null = null;
		let footerRestoreTimer: ReturnType<typeof setTimeout> | null = null;
		const clearFooterTimer = () => {
			if (!footerRestoreTimer) return;
			clearTimeout(footerRestoreTimer);
			footerRestoreTimer = null;
		};
		const getTerminalWidth = () => (typeof screen.width === "number" ? screen.width : 80);
		const getFooterHeight = () => (typeof footerBox.height === "number" ? footerBox.height : 1);
		const setFooterContent = (content: string) => {
			const formatted = formatFooterContent(content, getTerminalWidth());
			footerBox.height = formatted.height;
			footerBox.setContent(formatted.content);
		};

		const clearColumns = () => {
			for (const column of columns) {
				column.box.destroy();
			}
			columns = [];
		};

		const columnWidthFor = (count: number) => Math.max(1, Math.floor(100 / Math.max(1, count)));

		const getFormattedItems = (states: State[]) => {
			return states.map((state) => formatStateListItem(state, moveOp?.stateId === state.id));
		};

		const createColumnViews = (data: ColumnData[]) => {
			clearColumns();
			const widthPercent = columnWidthFor(data.length);
			data.forEach((columnData, idx) => {
				const left = idx * widthPercent;
				const isLast = idx === data.length - 1;
				const width = isLast ? `${Math.max(0, 100 - left)}%` : `${widthPercent}%`;
				const columnBox = box({
					parent: boardArea,
					left: `${left}%`,
					top: 0,
					width,
					height: "100%",
					border: { type: "line" },
					style: { border: { fg: "gray" } },
					label: formatColumnLabel(columnData.status, columnData.states.length),
				});

				const stateList = list({
					parent: columnBox,
					top: 1,
					left: 1,
					width: "100%-4",
					height: "100%-3",
					keys: false,
					mouse: true,
					scrollable: true,
					tags: true,
					style: { selected: { fg: "white" } },
				});

				stateList.setItems(getFormattedItems(columnData.states));
				columns.push({ status: columnData.status, states: columnData.states, list: stateList, box: columnBox });

				stateList.on("focus", () => {
					if (popupOpen || filterPopupOpen) return;
					if (currentCol !== idx) {
						setColumnActiveState(columns[currentCol], false);
						currentCol = idx;
					}
					setColumnActiveState(columns[currentCol], true);
					currentFocus = "board";
					filterHeader?.setBorderColor("cyan");
					updateFooter();
					screen.render();
				});
			});
		};

		const setColumnActiveState = (column: ColumnView | undefined, active: boolean) => {
			if (!column) return;
			const listStyle = column.list.style as { selected?: { bg?: string } };
			// In move mode, use green highlight for the moving state
			if (listStyle.selected) listStyle.selected.bg = moveOp && active ? "green" : active ? "blue" : undefined;
			const boxStyle = column.box.style as { border?: { fg?: string } };
			if (boxStyle.border) boxStyle.border.fg = active ? "yellow" : "gray";
		};

		const getSelectedStateId = (): string | undefined => {
			const column = columns[currentCol];
			if (!column) return undefined;
			const selectedIndex = column.list.selected ?? 0;
			return column.states[selectedIndex]?.id;
		};

		const focusColumn = (idx: number, preferredRow?: number, activate = true) => {
			if (popupOpen) return;
			if (idx < 0 || idx >= columns.length) return;
			const previous = columns[currentCol];
			setColumnActiveState(previous, false);

			currentCol = idx;
			const current = columns[currentCol];
			if (!current) return;

			const total = current.states.length;
			if (total > 0) {
				const previousSelected = typeof previous?.list.selected === "number" ? previous.list.selected : 0;
				const target = preferredRow !== undefined ? preferredRow : Math.min(previousSelected, total - 1);
				current.list.select(Math.max(0, target));
			}

			if (activate) {
				current.list.focus();
				setColumnActiveState(current, true);
				currentFocus = "board";
			} else {
				setColumnActiveState(current, false);
			}
			screen.render();
		};

		const restoreSelection = (stateId?: string) => {
			const activate = currentFocus !== "filters";
			if (columns.length === 0) return;
			if (stateId) {
				for (let colIdx = 0; colIdx < columns.length; colIdx += 1) {
					const column = columns[colIdx];
					if (!column) continue;
					const stateIndex = column.states.findIndex((state) => state.id === stateId);
					if (stateIndex !== -1) {
						focusColumn(colIdx, stateIndex, activate);
						return;
					}
				}
			}
			const safeIndex = Math.min(columns.length - 1, Math.max(0, currentCol));
			focusColumn(safeIndex, undefined, activate);
		};

		const applyColumnData = (data: ColumnData[], selectedStateId?: string) => {
			currentColumnsData = data;
			data.forEach((columnData, idx) => {
				const column = columns[idx];
				if (!column) return;
				column.status = columnData.status;
				column.states = columnData.states;
				column.list.setItems(getFormattedItems(columnData.states));
				column.box.setLabel?.(formatColumnLabel(columnData.status, columnData.states.length));
			});
			restoreSelection(selectedStateId);
		};

		const rebuildColumns = (data: ColumnData[], selectedStateId?: string) => {
			currentColumnsData = data;
			currentStatuses = data.map((column) => column.status);
			createColumnViews(data);
			restoreSelection(selectedStateId);
		};

		// Pure function to calculate the projected board state
		const getProjectedColumns = (allStates: State[], operation: MoveOperation | null): ColumnData[] => {
			if (!operation) {
				return prepareBoardColumns(allStates, currentStatuses);
			}

			// 1. Filter out the moving state from the source
			const statesWithoutMoving = allStates.filter((t) => t.id !== operation.stateId);
			const movingState = allStates.find((t) => t.id === operation.stateId);

			if (!movingState) {
				return prepareBoardColumns(allStates, currentStatuses);
			}

			// 2. Prepare columns without the moving state
			const columns = prepareBoardColumns(statesWithoutMoving, currentStatuses);

			// 3. Insert the moving state into the target column at the target index
			const targetColumn = columns.find((c) => c.status === operation.targetStatus);
			if (targetColumn) {
				// Create a "ghost" state with updated status
				const ghostState = { ...movingState, status: operation.targetStatus };

				// Clamp index to valid bounds
				const safeIndex = Math.max(0, Math.min(operation.targetIndex, targetColumn.states.length));
				targetColumn.states.splice(safeIndex, 0, ghostState);
			}

			return columns;
		};

		const focusFilterControl = (filterId: "search" | "priority" | "milestone" | "labels") => {
			if (!filterHeader) return;
			switch (filterId) {
				case "search":
					filterHeader.focusSearch();
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

		const openFilterPicker = async (filterId: "priority" | "milestone" | "labels") => {
			if (filterPopupOpen || moveOp || !filterHeader) {
				return;
			}
			filterPopupOpen = true;
			try {
				if (filterId === "labels") {
					const nextLabels = await openMultiSelectFilterPopup({
						screen,
						title: "Label Filter",
						items: [...configuredLabels].sort((a, b) => a.localeCompare(b)),
						selectedItems: sharedFilters.labelFilter,
					});
					if (nextLabels !== null) {
						sharedFilters.labelFilter = nextLabels;
						filterHeader.setFilters({ labels: nextLabels });
						emitFilterChange();
						renderView();
					}
					return;
				}

				if (filterId === "priority") {
					const priorities = ["high", "medium", "low"];
					const selected = await openSingleSelectFilterPopup({
						screen,
						title: "Priority Filter",
						selectedValue: sharedFilters.priorityFilter,
						choices: [
							{ label: "All", value: "" },
							...priorities.map((priority) => ({ label: priority, value: priority })),
						],
					});
					if (selected !== null) {
						sharedFilters.priorityFilter = selected;
						filterHeader.setFilters({ priority: selected });
						emitFilterChange();
						renderView();
					}
					return;
				}

				const selected = await openSingleSelectFilterPopup({
					screen,
					title: "Milestone Filter",
					selectedValue: sharedFilters.milestoneFilter,
					choices: [{ label: "All", value: "" }, ...availableMilestones.map((value) => ({ label: value, value }))],
				});
				if (selected !== null) {
					sharedFilters.milestoneFilter = selected;
					filterHeader.setFilters({ milestone: selected });
					emitFilterChange();
					renderView();
				}
			} finally {
				filterPopupOpen = false;
				focusFilterControl(filterId);
				screen.render();
			}
		};

		filterHeader = createFilterHeader({
			parent: container,
			statuses: [],
			availableLabels: configuredLabels,
			availableMilestones,
			visibleFilters: ["search", "priority", "milestone", "labels"],
			initialFilters: {
				search: sharedFilters.searchQuery,
				priority: sharedFilters.priorityFilter,
				labels: sharedFilters.labelFilter,
				milestone: sharedFilters.milestoneFilter,
			},
			onFilterChange: (filters: FilterState) => {
				sharedFilters.searchQuery = filters.search;
				sharedFilters.priorityFilter = filters.priority;
				sharedFilters.labelFilter = filters.labels;
				sharedFilters.milestoneFilter = filters.milestone;
				emitFilterChange();
				renderView();
			},
			onFilterPickerOpen: (filterId) => {
				if (filterId === "status") {
					return;
				}
				void openFilterPicker(filterId);
			},
		});
		filterHeader.setFocusChangeHandler((focus) => {
			if (focus !== null) {
				currentFocus = "filters";
				setColumnActiveState(columns[currentCol], false);
				updateFooter();
				screen.render();
			}
		});
		filterHeader.setExitRequestHandler((direction) => {
			const currentColumn = columns[currentCol];
			const selected = currentColumn?.list.selected;
			const currentIndex = typeof selected === "number" ? selected : undefined;
			const totalStates = currentColumn?.states.length ?? 0;
			const targetIndex = resolveSearchExitTargetIndex(direction, pendingSearchWrap, totalStates, currentIndex);
			pendingSearchWrap = null;
			focusColumn(currentCol, targetIndex);
			updateFooter();
		});
		const syncBoardAreaLayout = () => {
			const headerHeight = filterHeader?.getHeight() ?? 0;
			boardArea.top = headerHeight;
			boardArea.height = `100%-${headerHeight + getFooterHeight()}`;
		};
		syncBoardAreaLayout();

		const updateFooter = () => {
			if (transientFooterContent) {
				setFooterContent(transientFooterContent);
				syncBoardAreaLayout();
				return;
			}
			if (currentFocus === "filters") {
				const filterFocus = filterHeader?.getCurrentFocus();
				if (filterFocus === "search") {
					setFooterContent(
						" {cyan-fg}[←/→]{/} Cursor (edge=Prev/Next) | {cyan-fg}[↑/↓]{/} Back to Board | {cyan-fg}[Esc]{/} Cancel | {gray-fg}(Live search){/}",
					);
					syncBoardAreaLayout();
					return;
				}
				setFooterContent(
					" {cyan-fg}[Enter/Space]{/} Open Picker | {cyan-fg}[←/→]{/} Prev/Next | {cyan-fg}[Esc]{/} Back",
				);
				syncBoardAreaLayout();
				return;
			}
			if (moveOp) {
				setFooterContent(
					" {green-fg}MOVE MODE{/} | {cyan-fg}[←→]{/} Change Column | {cyan-fg}[↑↓]{/} Reorder | {cyan-fg}[Enter/M]{/} Confirm | {cyan-fg}[Esc]{/} Cancel",
				);
			} else {
				const base = DEFAULT_FOOTER_CONTENT;
				setFooterContent(hasActiveSharedFilters() ? `${base} | {yellow-fg}Filtered{/}` : base);
			}
			syncBoardAreaLayout();
		};

		const showTransientFooter = (message: string, durationMs = 3000) => {
			transientFooterContent = message;
			clearFooterTimer();
			updateFooter();
			screen.render();
			footerRestoreTimer = setTimeout(() => {
				transientFooterContent = null;
				footerRestoreTimer = null;
				updateFooter();
				screen.render();
			}, durationMs);
		};

		const renderView = () => {
			const projectedData = getProjectedColumns(getFilteredStates(), moveOp);

			// If we are moving, we want to select the moving state
			const selectedId = moveOp ? moveOp.stateId : getSelectedStateId();

			if (projectedData.length === 0) {
				const fallbackStatus = currentStatuses[0] ?? "No Status";
				rebuildColumns([{ status: fallbackStatus, states: [] }], selectedId);
			} else if (shouldRebuildColumns(currentColumnsData, projectedData)) {
				rebuildColumns(projectedData, selectedId);
			} else {
				applyColumnData(projectedData, selectedId);
			}

			updateFooter();
			screen.render();
		};

		rebuildColumns(initialColumns);
		const firstColumn = columns[0];
		if (firstColumn) {
			currentCol = 0;
			setColumnActiveState(firstColumn, true);
			if (firstColumn.states.length > 0) {
				firstColumn.list.select(0);
			}
			firstColumn.list.focus();
		}

		const updateBoard = (nextStates: State[], nextStatuses: string[]) => {
			// Update source of truth
			currentStates = nextStates;
			// Only update statuses if they changed (rare in TUI)
			if (nextStatuses.length > 0) currentStatuses = nextStatuses;
			configuredLabels = collectAvailableLabels(currentStates, options?.availableLabels ?? []);
			availableMilestones = Array.from(
				new Set([
					...(options?.availableMilestones ?? []),
					...currentStates
						.map((state) => state.milestone?.trim())
						.filter((milestone): milestone is string => Boolean(milestone && milestone.length > 0))
						.map((milestone) => resolveMilestoneLabel(milestone)),
				]),
			).sort((a, b) => a.localeCompare(b));

			renderView();
		};

		options?.subscribeUpdates?.(updateBoard);

		screen.on("resize", () => {
			filterHeader?.rebuild();
			syncBoardAreaLayout();
			renderView();
		});

		// Helper to get target column size (excluding the moving state if it's currently there)
		const getTargetColumnSize = (status: string): number => {
			const columnData = currentColumnsData.find((c) => c.status === status);
			if (!columnData) return 0;
			// If the moving state is currently in this column, we need to account for it
			if (moveOp && moveOp.targetStatus === status) {
				// The state is already "in" this column in the projected view
				return columnData.states.length;
			}
			// Otherwise, the state will be added to this column
			return columnData.states.length;
		};

		screen.key(["/", "C-f"], () => {
			if (popupOpen || filterPopupOpen || moveOp) return;
			pendingSearchWrap = null;
			focusFilterControl("search");
			updateFooter();
		});

		screen.key(["p", "P"], () => {
			if (popupOpen || filterPopupOpen || moveOp) return;
			void openFilterPicker("priority");
		});

		screen.key(["f", "F"], () => {
			if (popupOpen || filterPopupOpen || moveOp) return;
			void openFilterPicker("labels");
		});

		screen.key(["i", "I"], () => {
			if (popupOpen || filterPopupOpen || moveOp) return;
			void openFilterPicker("milestone");
		});

		screen.key(["left", "h"], () => {
			if (popupOpen || filterPopupOpen || currentFocus === "filters") return;
			if (moveOp) {
				const currentStatusIndex = currentStatuses.indexOf(moveOp.targetStatus);
				if (currentStatusIndex > 0) {
					const prevStatus = currentStatuses[currentStatusIndex - 1];
					if (prevStatus) {
						const prevColumnSize = getTargetColumnSize(prevStatus);
						moveOp.targetStatus = prevStatus;
						// Clamp index to valid range for new column (0 to size, where size means append at end)
						moveOp.targetIndex = Math.min(moveOp.targetIndex, prevColumnSize);
						renderView();
					}
				}
			} else {
				focusColumn(currentCol - 1);
			}
		});

		screen.key(["right", "l"], () => {
			if (popupOpen || filterPopupOpen || currentFocus === "filters") return;
			if (moveOp) {
				const currentStatusIndex = currentStatuses.indexOf(moveOp.targetStatus);
				if (currentStatusIndex < currentStatuses.length - 1) {
					const nextStatus = currentStatuses[currentStatusIndex + 1];
					if (nextStatus) {
						const nextColumnSize = getTargetColumnSize(nextStatus);
						moveOp.targetStatus = nextStatus;
						// Clamp index to valid range for new column
						moveOp.targetIndex = Math.min(moveOp.targetIndex, nextColumnSize);
						renderView();
					}
				}
			} else {
				focusColumn(currentCol + 1);
			}
		});

		screen.key(["up", "k"], () => {
			if (popupOpen || filterPopupOpen || currentFocus === "filters") return;

			if (moveOp) {
				if (moveOp.targetIndex > 0) {
					moveOp.targetIndex--;
					renderView();
				}
			} else {
				const column = columns[currentCol];
				if (!column) return;
				const listWidget = column.list;
				const selected = listWidget.selected ?? 0;
				const total = column.states.length;
				if (total === 0) {
					pendingSearchWrap = null;
					focusFilterControl("search");
					updateFooter();
					screen.render();
					return;
				}
				if (shouldMoveFromListBoundaryToSearch("up", selected, total)) {
					pendingSearchWrap = "to-last";
					focusFilterControl("search");
					updateFooter();
					screen.render();
					return;
				}
				const nextIndex = selected - 1;
				listWidget.select(nextIndex);
				screen.render();
			}
		});

		screen.key(["down", "j"], () => {
			if (popupOpen || filterPopupOpen || currentFocus === "filters") return;

			if (moveOp) {
				const column = columns[currentCol];
				// We need to check the projected length to know if we can move down
				// The current rendered column has the correct length including the ghost state
				if (column && moveOp.targetIndex < column.states.length - 1) {
					moveOp.targetIndex++;
					renderView();
				}
			} else {
				const column = columns[currentCol];
				if (!column) return;
				const listWidget = column.list;
				const selected = listWidget.selected ?? 0;
				const total = column.states.length;
				if (total === 0) {
					pendingSearchWrap = null;
					focusFilterControl("search");
					updateFooter();
					screen.render();
					return;
				}
				if (shouldMoveFromListBoundaryToSearch("down", selected, total)) {
					pendingSearchWrap = "to-first";
					focusFilterControl("search");
					updateFooter();
					screen.render();
					return;
				}
				const nextIndex = selected + 1;
				listWidget.select(nextIndex);
				screen.render();
			}
		});

		const openStateEditor = async (state: State) => {
			try {
				const core = new Core(process.cwd(), { enableWatchers: true });
				const result = await core.editStateInTui(state.id, screen, state);
				if (result.reason === "read_only") {
					const branchInfo = result.state?.branch ? ` from branch "${result.state.branch}"` : "";
					showTransientFooter(` {red-fg}Cannot edit state${branchInfo}.{/}`);
					return;
				}
				if (result.reason === "editor_failed") {
					showTransientFooter(" {red-fg}Editor exited with an error; state was not modified.{/}");
					return;
				}
				if (result.reason === "not_found") {
					showTransientFooter(` {red-fg}State ${state.id} not found on this branch.{/}`);
					return;
				}

				if (result.state) {
					currentStates = currentStates.map((existingState) =>
						existingState.id === state.id ? result.state || existingState : existingState,
					);
				}

				if (result.changed) {
					renderView();
					showTransientFooter(` {green-fg}State ${result.state?.id ?? state.id} marked modified.{/}`);
					return;
				}

				renderView();
				showTransientFooter(` {gray-fg}No changes detected for ${result.state?.id ?? state.id}.{/}`);
			} catch (_error) {
				showTransientFooter(" {red-fg}Failed to open editor.{/}");
			}
		};

		screen.key(["enter"], async () => {
			if (popupOpen || filterPopupOpen || currentFocus === "filters") return;

			// In move mode, Enter confirms the move
			if (moveOp) {
				await performStateMove();
				return;
			}

			const column = columns[currentCol];
			if (!column) return;
			const idx = column.list.selected ?? 0;
			if (idx < 0 || idx >= column.states.length) return;
			const state = column.states[idx];
			if (!state) return;
			popupOpen = true;

			const popup = await createStatePopup(screen, state, resolveMilestoneLabel);
			if (!popup) {
				popupOpen = false;
				return;
			}

			const { contentArea, close } = popup;
			contentArea.key(["escape", "q"], () => {
				popupOpen = false;
				close();
				focusColumn(currentCol);
			});

			contentArea.key(["e", "E", "S-e"], async () => {
				await openStateEditor(state);
			});

			screen.render();
		});

		const openQuickEdit = async (state: State, field: "title" | "assignee" | "labels") => {
			if (popupOpen || filterPopupOpen || currentFocus === "filters" || moveOp) return;
			
			const { promptText } = await import("./tui.ts");
			let message = "";
			let defaultValue = "";
			
			if (field === "title") {
				message = "New Title:";
				defaultValue = state.title;
			} else if (field === "assignee") {
				message = "Assignee (comma-separated):";
				defaultValue = state.assignee?.join(", ") ?? "";
			} else if (field === "labels") {
				message = "Labels (comma-separated):";
				defaultValue = state.labels?.join(", ") ?? "";
			}

			// Suspend screen to allow promptText (readline) to work
			screen.leave();
			const newValue = await promptText(message, defaultValue);
			screen.enter();
			
			if (newValue === defaultValue) {
				renderView();
				return;
			}

			try {
				const core = new Core(process.cwd());
				const updateInput: any = {};
				if (field === "title") updateInput.title = newValue;
				else if (field === "assignee") updateInput.assignee = newValue.split(",").map(s => s.trim()).filter(Boolean);
				else if (field === "labels") updateInput.labels = newValue.split(",").map(s => s.trim()).filter(Boolean);

				const updated = await core.editState(state.id, updateInput);
				currentStates = currentStates.map(s => s.id === state.id ? updated : s);
				showTransientFooter(` {green-fg}Updated ${field} for ${state.id}{/}`);
				renderView();
			} catch (error) {
				showTransientFooter(` {red-fg}Failed to update ${field}: ${error}{/}`);
				renderView();
			}
		};

		screen.key(["t", "T"], async () => {
			const column = columns[currentCol];
			if (!column) return;
			const idx = column.list.selected ?? 0;
			const state = column.states[idx];
			if (state) await openQuickEdit(state, "title");
		});

		screen.key(["a", "A"], async () => {
			const column = columns[currentCol];
			if (!column) return;
			const idx = column.list.selected ?? 0;
			const state = column.states[idx];
			if (state) await openQuickEdit(state, "assignee");
		});

		screen.key(["l", "L"], async () => {
			const column = columns[currentCol];
			if (!column) return;
			const idx = column.list.selected ?? 0;
			const state = column.states[idx];
			if (state) await openQuickEdit(state, "labels");
		});

		screen.key(["e", "E", "S-e"], async () => {
			if (popupOpen || filterPopupOpen || currentFocus === "filters") return;
			const column = columns[currentCol];
			if (!column) return;
			const idx = column.list.selected ?? 0;
			if (idx < 0 || idx >= column.states.length) return;
			const state = column.states[idx];
			if (!state) return;
			await openStateEditor(state);
		});

		const performStateMove = async () => {
			if (!moveOp) return;

			// Check if any actual change occurred
			const noChange = moveOp.targetStatus === moveOp.originalStatus && moveOp.targetIndex === moveOp.originalIndex;

			if (noChange) {
				// No change, just exit move mode
				moveOp = null;
				renderView();
				return;
			}

			try {
				const core = new Core(process.cwd(), { enableWatchers: true });
				const config = await core.fs.loadConfig();

				// Get the final state from the projection
				const projectedData = getProjectedColumns(currentStates, moveOp);
				const targetColumn = projectedData.find((c) => c.status === moveOp?.targetStatus);

				if (!targetColumn) {
					moveOp = null;
					renderView();
					return;
				}

				const orderedStateIds = targetColumn.states.map((state) => state.id);

				// Persist the move using core API
				const { updatedState, changedStates } = await core.reorderState({
					stateId: moveOp.stateId,
					targetStatus: moveOp.targetStatus,
					orderedStateIds,
					autoCommit: config?.autoCommit ?? false,
				});

				// Update local state with all changed states (includes ordinal updates)
				const changedStatesMap = new Map(changedStates.map((t) => [t.id, t]));
				changedStatesMap.set(updatedState.id, updatedState);
				currentStates = currentStates.map((t) => changedStatesMap.get(t.id) ?? t);

				// Exit move mode
				moveOp = null;

				// Render with updated local state
				renderView();
			} catch (error) {
				// On error, cancel the move and restore original position
				if (process.env.DEBUG) {
					console.error("Move failed:", error);
				}
				moveOp = null;
				renderView();
			}
		};
		const cancelMove = () => {
			if (!moveOp) return;

			// Exit move mode - pure state reset
			moveOp = null;

			renderView();
		};

		screen.key(["m", "M", "S-m"], async () => {
			if (popupOpen || filterPopupOpen || currentFocus === "filters") return;
			if (hasActiveSharedFilters()) {
				showTransientFooter(" {yellow-fg}Clear filters before moving states.{/}");
				return;
			}

			if (!moveOp) {
				const column = columns[currentCol];
				if (!column) return;
				const stateIndex = column.list.selected ?? 0;
				const state = column.states[stateIndex];
				if (!state) return;

				// Prevent move mode for cross-branch states
				if (state.branch) {
					showTransientFooter(` {red-fg}Cannot move state from branch "${state.branch}".{/}`);
					return;
				}

				// Enter move mode - store original position for cancel
				moveOp = {
					stateId: state.id,
					originalStatus: column.status,
					originalIndex: stateIndex,
					targetStatus: column.status,
					targetIndex: stateIndex,
				};

				renderView();
			} else {
				// Confirm move (same as Enter in move mode)
				await performStateMove();
			}
		});

		screen.key(["tab"], async () => {
			if (popupOpen || filterPopupOpen || currentFocus === "filters") return;
			const column = columns[currentCol];
			if (column) {
				const idx = column.list.selected ?? 0;
				if (idx >= 0 && idx < column.states.length) {
					const state = column.states[idx];
					if (state) options?.onStateSelect?.(state);
				}
			}

			if (options?.onTabPress) {
				clearFooterTimer();
				screen.destroy();
				await options.onTabPress();
				resolve();
				return;
			}

			if (options?.viewSwitcher) {
				clearFooterTimer();
				screen.destroy();
				await options.viewSwitcher.switchView();
				resolve();
			}
		});

		screen.key(["q", "C-c"], () => {
			if (popupOpen || filterPopupOpen) return;
			clearFooterTimer();
			screen.destroy();
			resolve();
		});

		screen.key(["escape"], () => {
			if (popupOpen || filterPopupOpen) return;
			if (currentFocus === "filters") {
				focusColumn(currentCol);
				updateFooter();
				return;
			}
			// In move mode, ESC cancels and restores original position
			if (moveOp) {
				cancelMove();
				return;
			}

			if (!popupOpen) {
				clearFooterTimer();
				screen.destroy();
				resolve();
			}
		});

		screen.render();
	});
}
