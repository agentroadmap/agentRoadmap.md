import type { Core } from "../core/roadmap.ts";
import { getStateStatistics } from "../core/statistics.ts";
import { createLoadingScreen } from "../ui/loading.ts";
import { renderOverviewTui } from "../ui/overview-tui.ts";

function formatTime(ms: number): string {
	if (ms < 1000) return `${Math.round(ms)}ms`;
	return `${(ms / 1000).toFixed(1)}s`;
}

export async function runOverviewCommand(core: Core): Promise<void> {
	const startTime = performance.now();

	// Load states with loading screen
	const loadingScreen = await createLoadingScreen("Loading project statistics");

	try {
		// Use the shared state loading logic
		const loadStart = performance.now();
		const {
			states: activeStates,
			drafts,
			statuses,
		} = await core.loadAllStatesForStatistics((msg) =>
			loadingScreen?.update(`${msg} in ${formatTime(performance.now() - loadStart)}`),
		);

		loadingScreen?.close();

		// Calculate statistics
		const statsStart = performance.now();
		const statistics = getStateStatistics(activeStates, drafts, statuses);
		const statsTime = Math.round(performance.now() - statsStart);

		// Display the TUI
		const totalTime = Math.round(performance.now() - startTime);
		console.log(`\nPerformance summary: Total time ${totalTime}ms (stats calculation: ${statsTime}ms)`);

		const config = await core.fs.loadConfig();
		await renderOverviewTui(statistics, config?.projectName || "Project");
	} catch (error) {
		loadingScreen?.close();
		throw error;
	}
}
