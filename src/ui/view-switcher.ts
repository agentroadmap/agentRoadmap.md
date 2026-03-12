/**
 * View switcher module for handling Tab key navigation between state views and kanban board
 * with intelligent background loading and state preservation.
 */

import type { Core } from "../core/roadmap.ts";
import type { State } from "../types/index.ts";

export type ViewType = "state-list" | "state-detail" | "kanban";

export interface ViewState {
	type: ViewType;
	selectedState?: State;
	states?: State[];
	filter?: {
		status?: string;
		assignee?: string;
		priority?: string;
		sort?: string;
		title?: string;
		filterDescription?: string;
		searchQuery?: string;
		parentStateId?: string;
	};
	kanbanData?: {
		states: State[];
		statuses: string[];
		isLoading: boolean;
		loadError?: string;
	};
}

export interface ViewSwitcherOptions {
	core: Core;
	initialState: ViewState;
	onViewChange?: (newState: ViewState) => void;
}

/**
 * Background loading state for kanban board data
 */
class BackgroundLoader {
	private loadingPromise: Promise<State[]> | null = null;
	private cachedStates: State[] | null = null;
	private lastLoadTime = 0;
	private readonly CACHE_TTL = 30000; // 30 seconds
	private onProgress?: (message: string) => void;
	private abortController?: AbortController;
	private lastProgressMessage = "";

	constructor(private core: Core) {}

	/**
	 * Start loading kanban data in the background
	 */
	startLoading(): void {
		// Don't start new loading if already loading or cache is fresh
		if (this.loadingPromise || this.isCacheFresh()) {
			return;
		}

		// Clear last progress message when starting fresh load
		this.lastProgressMessage = "";

		// Create new abort controller for this loading operation
		this.abortController = new AbortController();
		this.loadingPromise = this.loadKanbanData();
	}

	/**
	 * Get kanban data - either from cache or by waiting for loading
	 */
	async getKanbanData(): Promise<{ states: State[]; statuses: string[] }> {
		// Return cached data if fresh
		if (this.isCacheFresh() && this.cachedStates) {
			const config = await this.core.filesystem.loadConfig();
			return {
				states: this.cachedStates,
				statuses: config?.statuses || [],
			};
		}

		// Start loading if not already
		if (!this.loadingPromise) {
			this.abortController = new AbortController();
			this.loadingPromise = this.loadKanbanData();
		} else {
			// If loading is already in progress, send a status update to the current progress callback
			this.onProgress?.("Loading states from local and remote branches...");
		}

		// Wait for loading to complete
		const states = await this.loadingPromise;
		const config = await this.core.filesystem.loadConfig();

		return {
			states,
			statuses: config?.statuses || [],
		};
	}

	/**
	 * Check if we have fresh cached data
	 */
	isReady(): boolean {
		return this.isCacheFresh() && this.cachedStates !== null;
	}

	/**
	 * Get loading status
	 */
	isLoading(): boolean {
		return this.loadingPromise !== null && !this.isCacheFresh();
	}

	private isCacheFresh(): boolean {
		return Date.now() - this.lastLoadTime < this.CACHE_TTL;
	}

	private async loadKanbanData(): Promise<State[]> {
		try {
			// Check for cancellation at the start
			if (this.abortController?.signal.aborted) {
				throw new Error("Loading cancelled");
			}

			// Create a progress wrapper that stores the last message
			const progressWrapper = (msg: string) => {
				this.lastProgressMessage = msg;
				this.onProgress?.(msg);
			};

			// Use the shared Core method for loading board states
			const filteredStates = await this.core.loadStates(progressWrapper, this.abortController?.signal);

			// Cache the results
			this.cachedStates = filteredStates;
			this.lastLoadTime = Date.now();
			this.loadingPromise = null;
			this.lastProgressMessage = ""; // Clear progress message after completion

			return filteredStates;
		} catch (error) {
			this.loadingPromise = null;
			this.lastProgressMessage = ""; // Clear progress message on error
			// If it's a cancellation, don't treat it as an error
			if (error instanceof Error && error.message === "Loading cancelled") {
				return []; // Return empty array instead of exiting
			}
			throw error;
		}
	}

	/**
	 * Set progress callback for loading updates
	 */
	setProgressCallback(callback: (message: string) => void): void {
		this.onProgress = callback;
		// If we have a last progress message and loading is in progress, send it immediately
		if (this.lastProgressMessage && this.loadingPromise) {
			callback(this.lastProgressMessage);
		}
	}

	/**
	 * Seed the cache with pre-loaded states to avoid redundant loading
	 */
	seedCache(states: State[]): void {
		this.cachedStates = states;
		this.lastLoadTime = Date.now();
	}

	/**
	 * Cancel any ongoing loading operations
	 */
	cancelLoading(): void {
		if (this.abortController) {
			this.abortController.abort();
			this.abortController = undefined;
		}
		this.loadingPromise = null;
	}
}

/**
 * Main view switcher class
 */
export class ViewSwitcher {
	private state: ViewState;
	private backgroundLoader: BackgroundLoader;
	private onViewChange?: (newState: ViewState) => void;

	constructor(options: ViewSwitcherOptions) {
		this.state = options.initialState;
		this.backgroundLoader = new BackgroundLoader(options.core);
		this.onViewChange = options.onViewChange;

		// If starting with kanban view and we already have loaded states, seed the cache
		if (this.state.type === "kanban" && this.state.kanbanData?.states && !this.state.kanbanData.isLoading) {
			this.backgroundLoader.seedCache(this.state.kanbanData.states);
		}
		// Note: We no longer auto-start background loading - states are loaded once
		// at the unified view level and passed through
	}

	/**
	 * Get current view state
	 */
	getState(): ViewState {
		return { ...this.state };
	}

	/**
	 * Switch to the next view based on current state
	 */
	async switchView(): Promise<ViewState> {
		switch (this.state.type) {
			case "state-list":
			case "state-detail":
				// Switch to kanban board
				return await this.switchToKanban();
			case "kanban":
				// Switch back to previous state view
				return this.switchToStateView();
			default:
				return this.state;
		}
	}

	/**
	 * Switch to kanban board view
	 */
	private async switchToKanban(): Promise<ViewState> {
		try {
			if (this.backgroundLoader.isReady()) {
				// Data is ready, switch instantly
				const { states, statuses } = await this.backgroundLoader.getKanbanData();
				this.state = {
					...this.state,
					type: "kanban",
					kanbanData: {
						states,
						statuses,
						isLoading: false,
					},
				};
			} else {
				// Data is still loading, indicate loading state
				this.state = {
					...this.state,
					type: "kanban",
					kanbanData: {
						states: [],
						statuses: [],
						isLoading: true,
					},
				};
			}

			this.onViewChange?.(this.state);
			return this.state;
		} catch (error) {
			// Handle loading error
			this.state = {
				...this.state,
				type: "kanban",
				kanbanData: {
					states: [],
					statuses: [],
					isLoading: false,
					loadError: error instanceof Error ? error.message : "Failed to load kanban data",
				},
			};

			this.onViewChange?.(this.state);
			return this.state;
		}
	}

	/**
	 * Switch back to state view (preserve previous view type)
	 */
	private switchToStateView(): ViewState {
		// Default to state-list if no previous state view
		const viewType = this.state.selectedState ? "state-detail" : "state-list";

		this.state = {
			...this.state,
			type: viewType,
		};

		// Start background loading for next potential kanban switch
		this.backgroundLoader.startLoading();

		this.onViewChange?.(this.state);
		return this.state;
	}

	/**
	 * Update the current state (used when user navigates within a view)
	 */
	updateState(updates: Partial<ViewState>): ViewState {
		this.state = { ...this.state, ...updates };

		// Start background loading if switching to state views
		if (this.state.type === "state-list" || this.state.type === "state-detail") {
			this.backgroundLoader.startLoading();
		}

		this.onViewChange?.(this.state);
		return this.state;
	}

	/**
	 * Check if kanban data is ready for instant switching
	 */
	isKanbanReady(): boolean {
		return this.backgroundLoader.isReady();
	}

	/**
	 * Pre-load kanban data
	 */
	preloadKanban(): void {
		this.backgroundLoader.startLoading();
	}

	/**
	 * Get kanban data - delegates to background loader
	 */
	async getKanbanData(): Promise<{ states: State[]; statuses: string[] }> {
		return await this.backgroundLoader.getKanbanData();
	}

	/**
	 * Set progress callback for loading updates
	 */
	setProgressCallback(callback: (message: string) => void): void {
		this.backgroundLoader.setProgressCallback(callback);
	}

	/**
	 * Clean up resources and cancel any ongoing operations
	 */
	cleanup(): void {
		this.backgroundLoader.cancelLoading();
	}
}
