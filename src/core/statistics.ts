import type { State } from "../types/index.ts";

export interface StateStatistics {
	statusCounts: Map<string, number>;
	priorityCounts: Map<string, number>;
	totalStates: number;
	completedStates: number;
	completionPercentage: number;
	draftCount: number;
	recentActivity: {
		created: State[];
		updated: State[];
	};
	projectHealth: {
		averageStateAge: number;
		staleStates: State[];
		blockedStates: State[];
	};
}

/**
 * Calculate comprehensive state statistics for the overview
 */
export function getStateStatistics(states: State[], drafts: State[], statuses: string[]): StateStatistics {
	const statusCounts = new Map<string, number>();
	const priorityCounts = new Map<string, number>();

	// Initialize status counts
	for (const status of statuses) {
		statusCounts.set(status, 0);
	}

	// Initialize priority counts
	priorityCounts.set("high", 0);
	priorityCounts.set("medium", 0);
	priorityCounts.set("low", 0);
	priorityCounts.set("none", 0);

	let completedStates = 0;
	const now = new Date();
	const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
	const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

	const recentlyCreated: State[] = [];
	const recentlyUpdated: State[] = [];
	const staleStates: State[] = [];
	const blockedStates: State[] = [];
	let totalAge = 0;
	let stateCount = 0;

	// Process each state
	for (const state of states) {
		// Skip states with empty or undefined status
		if (!state.status || state.status === "") {
			continue;
		}

		// Count by status
		const currentCount = statusCounts.get(state.status) || 0;
		statusCounts.set(state.status, currentCount + 1);

		// Count completed states
		if (state.status === "Done") {
			completedStates++;
		}

		// Count by priority
		const priority = state.priority || "none";
		const priorityCount = priorityCounts.get(priority) || 0;
		priorityCounts.set(priority, priorityCount + 1);

		// Track recent activity
		if (state.createdDate) {
			const createdDate = new Date(state.createdDate);
			if (createdDate >= oneWeekAgo) {
				recentlyCreated.push(state);
			}

			// Calculate state age
			// For completed states, use the time from creation to completion
			// For active states, use the time from creation to now
			let ageInDays: number;
			if (state.status === "Done" && state.updatedDate) {
				const updatedDate = new Date(state.updatedDate);
				ageInDays = Math.floor((updatedDate.getTime() - createdDate.getTime()) / (24 * 60 * 60 * 1000));
			} else {
				ageInDays = Math.floor((now.getTime() - createdDate.getTime()) / (24 * 60 * 60 * 1000));
			}
			totalAge += ageInDays;
			stateCount++;
		}

		if (state.updatedDate) {
			const updatedDate = new Date(state.updatedDate);
			if (updatedDate >= oneWeekAgo) {
				recentlyUpdated.push(state);
			}
		}

		// Identify stale states (not updated in 30 days and not done)
		if (state.status !== "Done") {
			const lastDate = state.updatedDate || state.createdDate;
			if (lastDate) {
				const date = new Date(lastDate);
				if (date < oneMonthAgo) {
					staleStates.push(state);
				}
			}
		}

		// Identify blocked states (has dependencies that are not done)
		if (state.dependencies && state.dependencies.length > 0 && state.status !== "Done") {
			// Check if any dependency is not done
			const hasBlockingDependency = state.dependencies.some((depId) => {
				const dep = states.find((t) => t.id === depId);
				return dep && dep.status !== "Done";
			});

			if (hasBlockingDependency) {
				blockedStates.push(state);
			}
		}
	}

	// Sort recent activity by date
	recentlyCreated.sort((a, b) => {
		const dateA = new Date(a.createdDate || 0);
		const dateB = new Date(b.createdDate || 0);
		return dateB.getTime() - dateA.getTime();
	});

	recentlyUpdated.sort((a, b) => {
		const dateA = new Date(a.updatedDate || 0);
		const dateB = new Date(b.updatedDate || 0);
		return dateB.getTime() - dateA.getTime();
	});

	// Calculate average state age
	const averageStateAge = stateCount > 0 ? Math.round(totalAge / stateCount) : 0;

	// Calculate completion percentage (only count states with valid status)
	const totalStates = Array.from(statusCounts.values()).reduce((sum, count) => sum + count, 0);
	const completionPercentage = totalStates > 0 ? Math.round((completedStates / totalStates) * 100) : 0;

	return {
		statusCounts,
		priorityCounts,
		totalStates,
		completedStates,
		completionPercentage,
		draftCount: drafts.length,
		recentActivity: {
			created: recentlyCreated.slice(0, 5), // Top 5 most recent
			updated: recentlyUpdated.slice(0, 5), // Top 5 most recent
		},
		projectHealth: {
			averageStateAge,
			staleStates: staleStates.slice(0, 5), // Top 5 stale states
			blockedStates: blockedStates.slice(0, 5), // Top 5 blocked states
		},
	};
}
