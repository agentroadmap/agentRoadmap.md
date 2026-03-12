/**
 * Simplified unified view that manages a single screen for Tab switching
 */

import type { Core } from "../core/roadmap.ts";
import type { State } from "../types/index.ts";
import { hasAnyPrefix } from "../utils/prefix-config.ts";
import { renderBoardTui } from "./board.ts";
import { viewStateEnhanced } from "./state-viewer-with-search.ts";
import type { ViewType } from "./view-switcher.ts";

export interface SimpleUnifiedViewOptions {
	core: Core;
	initialView: ViewType;
	selectedState?: State;
	states?: State[];
	filter?: {
		status?: string;
		assignee?: string;
		priority?: string;
		sort?: string;
		title?: string;
		filterDescription?: string;
	};
	preloadedKanbanData?: {
		states: State[];
		statuses: string[];
	};
}

/**
 * Simple unified view that handles Tab switching without multiple screens
 */
export async function runSimpleUnifiedView(options: SimpleUnifiedViewOptions): Promise<void> {
	let currentView = options.initialView;
	let selectedState = options.selectedState;
	let isRunning = true;

	// Simple state management without complex ViewSwitcher
	const switchView = async (): Promise<void> => {
		if (!isRunning) return;

		switch (currentView) {
			case "state-list":
			case "state-detail":
				// Switch to kanban
				currentView = "kanban";
				await showKanbanBoard();
				break;
			case "kanban":
				// Always go to state-list view when switching from board, keeping selected state highlighted
				currentView = "state-list";
				await showStateView();
				break;
		}
	};

	const showStateView = async (): Promise<void> => {
		// Extra safeguard: filter out any states without proper IDs
		const validStates = (options.states || []).filter((t) => t.id && t.id.trim() !== "" && hasAnyPrefix(t.id));

		if (!validStates || validStates.length === 0) {
			console.log("No states available.");
			isRunning = false;
			return;
		}

		const stateToView = selectedState || validStates[0];
		if (!stateToView) {
			isRunning = false;
			return;
		}

		// Show state viewer with simple view switching
		await viewStateEnhanced(stateToView, {
			states: validStates,
			core: options.core,
			title: options.filter?.title,
			filterDescription: options.filter?.filterDescription,
			startWithDetailFocus: currentView === "state-detail",
			// Use a simple callback instead of complex ViewSwitcher
			onStateChange: (newState) => {
				selectedState = newState;
				currentView = "state-detail";
			},
			// Custom Tab handler
			onTabPress: async () => {
				await switchView();
			},
		});

		isRunning = false;
	};

	const showKanbanBoard = async (): Promise<void> => {
		let kanbanStates: State[];
		let statuses: string[];

		if (options.preloadedKanbanData) {
			// Use preloaded data but filter for valid states
			kanbanStates = options.preloadedKanbanData.states.filter((t) => t.id && t.id.trim() !== "" && hasAnyPrefix(t.id));
			statuses = options.preloadedKanbanData.statuses;
		} else {
			// This shouldn't happen in practice since CLI preloads, but fallback
			const validKanbanStates = (options.states || []).filter((t) => t.id && t.id.trim() !== "" && hasAnyPrefix(t.id));
			kanbanStates = validKanbanStates.map((t) => ({ ...t, source: "local" as const }));
			const config = await options.core.filesystem.loadConfig();
			statuses = config?.statuses || [];
		}

		const config = await options.core.filesystem.loadConfig();
		const layout = "horizontal" as const;
		const maxColumnWidth = config?.maxColumnWidth || 20;

		// Show kanban board with simple view switching
		await renderBoardTui(kanbanStates, statuses, layout, maxColumnWidth, {
			onStateSelect: (state) => {
				selectedState = state;
			},
			// Custom Tab handler
			onTabPress: async () => {
				await switchView();
			},
		});

		isRunning = false;
	};

	// Start with the initial view
	switch (options.initialView) {
		case "state-list":
		case "state-detail":
			await showStateView();
			break;
		case "kanban":
			await showKanbanBoard();
			break;
	}
}
