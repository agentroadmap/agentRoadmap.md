import type { State } from "../types/index.ts";

export const DEFAULT_ORDINAL_STEP = 1000;
const EPSILON = 1e-6;

export interface CalculateNewOrdinalOptions {
	previous?: Pick<State, "id" | "ordinal"> | null;
	next?: Pick<State, "id" | "ordinal"> | null;
	defaultStep?: number;
}

export interface CalculateNewOrdinalResult {
	ordinal: number;
	requiresRebalance: boolean;
}

export function calculateNewOrdinal(options: CalculateNewOrdinalOptions): CalculateNewOrdinalResult {
	const { previous, next, defaultStep = DEFAULT_ORDINAL_STEP } = options;
	const prevOrdinal = previous?.ordinal;
	const nextOrdinal = next?.ordinal;

	if (prevOrdinal === undefined && nextOrdinal === undefined) {
		return { ordinal: defaultStep, requiresRebalance: false };
	}

	if (prevOrdinal === undefined) {
		if (nextOrdinal === undefined) {
			return { ordinal: defaultStep, requiresRebalance: false };
		}
		const candidate = nextOrdinal / 2;
		const requiresRebalance = !Number.isFinite(candidate) || candidate <= 0 || candidate >= nextOrdinal - EPSILON;
		return { ordinal: candidate, requiresRebalance };
	}

	if (nextOrdinal === undefined) {
		const candidate = prevOrdinal + defaultStep;
		const requiresRebalance = !Number.isFinite(candidate);
		return { ordinal: candidate, requiresRebalance };
	}

	const gap = nextOrdinal - prevOrdinal;
	if (gap <= EPSILON) {
		return { ordinal: prevOrdinal + defaultStep, requiresRebalance: true };
	}

	const candidate = prevOrdinal + gap / 2;
	const requiresRebalance = candidate <= prevOrdinal + EPSILON || candidate >= nextOrdinal - EPSILON;
	return { ordinal: candidate, requiresRebalance };
}

export interface ResolveOrdinalConflictsOptions {
	defaultStep?: number;
	startOrdinal?: number;
	forceSequential?: boolean;
}

export function resolveOrdinalConflicts<T extends { id: string; ordinal?: number }>(
	states: T[],
	options: ResolveOrdinalConflictsOptions = {},
): T[] {
	const defaultStep = options.defaultStep ?? DEFAULT_ORDINAL_STEP;
	const startOrdinal = options.startOrdinal ?? defaultStep;
	const forceSequential = options.forceSequential ?? false;

	const updates: T[] = [];
	let lastOrdinal: number | undefined;

	for (let index = 0; index < states.length; index += 1) {
		const state = states[index];
		if (!state) {
			continue;
		}
		let assigned: number;

		if (forceSequential) {
			assigned = index === 0 ? startOrdinal : (lastOrdinal ?? startOrdinal) + defaultStep;
		} else if (state.ordinal === undefined) {
			assigned = index === 0 ? startOrdinal : (lastOrdinal ?? startOrdinal) + defaultStep;
		} else if (lastOrdinal !== undefined && state.ordinal <= lastOrdinal) {
			assigned = lastOrdinal + defaultStep;
		} else {
			assigned = state.ordinal;
		}

		if (assigned !== state.ordinal) {
			updates.push({
				...state,
				ordinal: assigned,
			});
		}

		lastOrdinal = assigned;
	}

	return updates;
}
