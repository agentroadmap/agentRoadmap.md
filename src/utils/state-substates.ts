import type { State } from "../types/index.ts";
import { stateIdsEqual } from "./state-path.ts";
import { sortByStateId } from "./state-sorting.ts";

export function attachSubstateSummaries(state: State, states: State[]): State {
	let parentTitle: string | undefined;
	if (state.parentStateId) {
		const parent = states.find((candidate) => stateIdsEqual(state.parentStateId ?? "", candidate.id));
		if (parent) {
			parentTitle = parent.title;
		}
	}

	const summaries: Array<{ id: string; title: string }> = [];
	for (const candidate of states) {
		if (!candidate.parentStateId) continue;
		if (!stateIdsEqual(candidate.parentStateId, state.id)) continue;
		summaries.push({ id: candidate.id, title: candidate.title });
	}

	if (summaries.length === 0) {
		if (parentTitle && parentTitle !== state.parentStateTitle) {
			return {
				...state,
				parentStateTitle: parentTitle,
			};
		}
		return state;
	}

	const sortedSummaries = sortByStateId(summaries);
	return {
		...state,
		...(parentTitle && parentTitle !== state.parentStateTitle ? { parentStateTitle: parentTitle } : {}),
		substates: sortedSummaries.map((summary) => summary.id),
		substateSummaries: sortedSummaries,
	};
}
