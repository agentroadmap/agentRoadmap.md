/**
 * Enhanced views with Tab key switching between state views and kanban board
 */

import type { Core } from "../core/roadmap.ts";
import type { State } from "../types/index.ts";
import { renderBoardTui } from "./board.ts";
import { createLoadingScreen } from "./loading.ts";
import { type ViewState, ViewSwitcher, type ViewType } from "./view-switcher.ts";

export interface EnhancedViewOptions {
	core: Core;
	initialView: ViewType;
	selectedState?: State;
	states?: State[];
	filter?: {
		status?: string;
		assignee?: string;
		title?: string;
		filterDescription?: string;
	};
}

/**
 * Main enhanced view controller that handles Tab switching between views
 */
export async function runEnhancedViews(options: EnhancedViewOptions): Promise<void> {
	const initialState: ViewState = {
		type: options.initialView,
		selectedState: options.selectedState,
		states: options.states,
		filter: options.filter,
	};

	const _currentView: (() => Promise<void>) | null = null;
	let viewSwitcher: ViewSwitcher | null = null;

	// Create view switcher with state change handler
	viewSwitcher = new ViewSwitcher({
		core: options.core,
		initialState,
		onViewChange: async (newState) => {
			// Handle view changes triggered by the switcher
			await switchToView(newState);
		},
	});

	// Function to switch to a specific view
	const switchToView = async (state: ViewState): Promise<void> => {
		switch (state.type) {
			case "state-list":
			case "state-detail":
				await switchToStateView(state);
				break;
			case "kanban":
				await switchToKanbanView(state);
				break;
		}
	};

	// Function to handle switching to state view
	const switchToStateView = async (state: ViewState): Promise<void> => {
		if (!state.states || state.states.length === 0) {
			console.log("No states available.");
			return;
		}

		const stateToView = state.selectedState || state.states[0];
		if (!stateToView) return;

		// Create enhanced state viewer with Tab switching
		await viewStateEnhancedWithSwitching(stateToView, {
			states: state.states,
			core: options.core,
			title: state.filter?.title,
			filterDescription: state.filter?.filterDescription,
			startWithDetailFocus: state.type === "state-detail",
			viewSwitcher,
			onStateChange: (newState) => {
				// Update state when user navigates to different state
				viewSwitcher?.updateState({
					selectedState: newState,
					type: newState ? "state-detail" : "state-list",
				});
			},
		});
	};

	// Function to handle switching to kanban view
	const switchToKanbanView = async (state: ViewState): Promise<void> => {
		if (!state.kanbanData) return;

		if (state.kanbanData.isLoading) {
			// Show loading screen while waiting for data
			const loadingScreen = await createLoadingScreen("Loading kanban board");

			try {
				// Wait for kanban data to load
				const result = await viewSwitcher?.getKanbanData();
				if (!result) throw new Error("Failed to get kanban data");
				const { states, statuses } = result;
				loadingScreen?.close();

				// Now show the kanban board
				await renderBoardTuiWithSwitching(states, statuses, {
					viewSwitcher,
					onStateSelect: (state) => {
						// When user selects a state in kanban, prepare for potential switch back
						viewSwitcher?.updateState({
							selectedState: state,
						});
					},
				});
			} catch (error) {
				loadingScreen?.close();
				console.error("Failed to load kanban data:", error);
			}
		} else if (state.kanbanData.loadError) {
			console.error("Error loading kanban board:", state.kanbanData.loadError);
		} else {
			// Data is ready, show kanban board immediately
			await renderBoardTuiWithSwitching(state.kanbanData.states, state.kanbanData.statuses, {
				viewSwitcher,
				onStateSelect: (state) => {
					viewSwitcher?.updateState({
						selectedState: state,
					});
				},
			});
		}
	};

	// Start with the initial view
	await switchToView(initialState);
}

/**
 * Enhanced state viewer that supports view switching
 */
async function viewStateEnhancedWithSwitching(
	state: State,
	options: {
		states?: State[];
		core: Core;
		title?: string;
		filterDescription?: string;
		startWithDetailFocus?: boolean;
		viewSwitcher?: ViewSwitcher;
		onStateChange?: (state: State) => void;
	},
): Promise<void> {
	// Import the original viewStateEnhanced function
	const { viewStateEnhanced } = await import("./state-viewer-with-search.ts");

	// For now, use the original function but we'll need to modify it to support Tab switching
	// This is a placeholder - we'll need to modify the actual state-viewer-with-search.ts
	return viewStateEnhanced(state, {
		states: options.states,
		core: options.core,
		title: options.title,
		filterDescription: options.filterDescription,
		startWithDetailFocus: options.startWithDetailFocus,
		// Add view switcher support
		viewSwitcher: options.viewSwitcher,
		onStateChange: options.onStateChange,
	});
}

/**
 * Enhanced kanban board that supports view switching
 */
async function renderBoardTuiWithSwitching(
	states: State[],
	statuses: string[],
	_options: {
		viewSwitcher?: ViewSwitcher;
		onStateSelect?: (state: State) => void;
	},
): Promise<void> {
	// Get config for layout and column width
	const core = new (await import("../core/roadmap.ts")).Core(process.cwd());
	const config = await core.filesystem.loadConfig();
	const layout = "horizontal" as const; // Default layout
	const maxColumnWidth = config?.maxColumnWidth || 20;

	// For now, use the original function but we'll need to modify it to support Tab switching
	// This is a placeholder - we'll need to modify the actual board.ts
	return renderBoardTui(states, statuses, layout, maxColumnWidth);
}

// Re-export for convenience
export { type ViewState, ViewSwitcher, type ViewType } from "./view-switcher.ts";

// Helper function import
