import type { Sequence, State } from "../types/index.ts";
import { sortByStateId } from "../utils/state-sorting.ts";

/**
 * Compute execution sequences (layers) from state dependencies.
 * - Sequence 1 contains states with no dependencies among the provided set.
 * - Subsequent sequences contain states whose dependencies appear in earlier sequences.
 * - Dependencies that reference states outside the provided set are ignored for layering.
 * - If cycles exist, any remaining states are emitted in a final sequence to ensure each state
 *   appears exactly once (consumers may choose to surface a warning in that case).
 */
export function computeSequences(states: State[]): { unsequenced: State[]; sequences: Sequence[] } {
	// Map state id -> state for fast lookups
	const byId = new Map<string, State>();
	for (const t of states) byId.set(t.id, t);

	const allIds = new Set(Array.from(byId.keys()));

	// Build adjacency using only edges within provided set
	const successors = new Map<string, string[]>();
	const indegree = new Map<string, number>();
	for (const id of allIds) {
		successors.set(id, []);
		indegree.set(id, 0);
	}
	for (const t of states) {
		const deps = Array.isArray(t.dependencies) ? t.dependencies : [];
		for (const dep of deps) {
			if (!allIds.has(dep)) continue; // ignore external deps for layering
			successors.get(dep)?.push(t.id);
			indegree.set(t.id, (indegree.get(t.id) || 0) + 1);
		}
	}

	// Identify isolated states: absolutely no dependencies (even external) AND no internal dependents
	const hasAnyDeps = (t: State) => (t.dependencies || []).length > 0;
	const hasDependents = (id: string) => (successors.get(id) || []).length > 0;

	const unsequenced = sortByStateId(
		states.filter((t) => !hasAnyDeps(t) && !hasDependents(t.id) && t.ordinal === undefined),
	);

	// Build layering set by excluding unsequenced states
	const layeringIds = new Set(Array.from(allIds).filter((id) => !unsequenced.some((t) => t.id === id)));

	// Kahn-style layered topological grouping on the remainder
	const sequences: Sequence[] = [];
	const remaining = new Set(layeringIds);

	// Prepare local indegree copy considering only remaining nodes
	const indegRem = new Map<string, number>();
	for (const id of remaining) indegRem.set(id, 0);
	for (const id of remaining) {
		const t = byId.get(id);
		if (!t) continue;
		for (const dep of t.dependencies || []) {
			if (remaining.has(dep)) indegRem.set(id, (indegRem.get(id) || 0) + 1);
		}
	}

	while (remaining.size > 0) {
		const layerIds: string[] = [];
		for (const id of remaining) {
			if ((indegRem.get(id) || 0) === 0) layerIds.push(id);
		}

		if (layerIds.length === 0) {
			// Cycle detected; emit all remaining nodes as final layer (deterministic order)
			const finalStates = sortByStateId(
				Array.from(remaining)
					.map((id) => byId.get(id))
					.filter((t): t is State => Boolean(t)),
			);
			sequences.push({ index: sequences.length + 1, states: finalStates });
			break;
		}

		const layerStates = sortByStateId(layerIds.map((id) => byId.get(id)).filter((t): t is State => Boolean(t)));
		sequences.push({ index: sequences.length + 1, states: layerStates });

		for (const id of layerIds) {
			remaining.delete(id);
			for (const succ of successors.get(id) || []) {
				if (!remaining.has(succ)) continue;
				indegRem.set(succ, (indegRem.get(succ) || 0) - 1);
			}
		}
	}

	return { unsequenced, sequences };
}

/**
 * Return true if the state has no dependencies and no dependents among the provided set.
 * Note: Ordinal is intentionally ignored here; computeSequences handles ordinal when grouping.
 */
export function canMoveToUnsequenced(states: State[], stateId: string): boolean {
	const byId = new Map<string, State>(states.map((t) => [t.id, t]));
	const t = byId.get(stateId);
	if (!t) return false;
	const allIds = new Set(byId.keys());
	const hasDeps = (t.dependencies || []).some((d) => allIds.has(d));
	if (hasDeps) return false;
	const hasDependents = states.some((x) => (x.dependencies || []).includes(stateId));
	return !hasDependents;
}

/**
 * Adjust dependencies when moving a state to a target sequence index.
 *
 * Rules:
 * - Set moved state's dependencies to all state IDs from the immediately previous
 *   sequence (targetIndex - 1). If targetIndex is 1, dependencies become [].
 * - Add the moved state as a dependency to all states in the immediately next
 *   sequence (targetIndex + 1). Duplicates are removed.
 * - Other dependencies remain unchanged for other states.
 */
export function adjustDependenciesForMove(
	states: State[],
	sequences: Sequence[],
	movedStateId: string,
	targetSequenceIndex: number,
): State[] {
	// Join semantics: set moved.dependencies to previous sequence states (if any),
	// do NOT add moved as a dependency to next-sequence states, and do not touch others.
	const byId = new Map<string, State>(states.map((t) => [t.id, { ...t }]));
	const moved = byId.get(movedStateId);
	if (!moved) return states;

	const prevSeq = sequences.find((s) => s.index === targetSequenceIndex - 1);
	// Exclude the moved state itself to avoid creating a self-dependency when moving from seq N to N+1
	const prevIds = prevSeq ? prevSeq.states.map((t) => t.id).filter((id) => id !== movedStateId) : [];

	moved.dependencies = [...prevIds];
	byId.set(moved.id, moved);

	return Array.from(byId.values());
}

/**
 * Insert a new sequence by dropping a state between two existing sequences.
 *
 * Semantics (K in [0..N]):
 * - Dropping between Sequence K and K+1 creates a new Sequence K+1 containing the moved state.
 * - Update dependencies so that:
 *   - moved.dependencies = all state IDs from Sequence K (or [] when K = 0), excluding itself.
 *   - every state currently in Sequence K+1 adds the moved state ID to its dependencies (deduped).
 * - No other states are modified.
 * - Special case when there is no next sequence (K = N): only moved.dependencies are updated.
 * - Special case when K = 0 and there is no next sequence and moved.dependencies remain empty:
 *   assign moved.ordinal = 0 to ensure it participates in layering (avoids Unsequenced bucket).
 */
export function adjustDependenciesForInsertBetween(
	states: State[],
	sequences: Sequence[],
	movedStateId: string,
	betweenK: number,
): State[] {
	const byId = new Map<string, State>(states.map((t) => [t.id, { ...t }]));
	const moved = byId.get(movedStateId);
	if (!moved) return states;

	// Normalize K to integer within [0..N]
	const maxK = sequences.length;
	const K = Math.max(0, Math.min(maxK, Math.floor(betweenK)));

	const prevSeq = sequences.find((s) => s.index === K);
	const nextSeq = sequences.find((s) => s.index === K + 1);

	const prevIds = prevSeq ? prevSeq.states.map((t) => t.id).filter((id) => id !== movedStateId) : [];
	moved.dependencies = [...prevIds];

	// Update next sequence states to depend on moved state
	if (nextSeq) {
		for (const t of nextSeq.states) {
			const orig = byId.get(t.id);
			if (!orig) continue;
			const deps = Array.isArray(orig.dependencies) ? orig.dependencies : [];
			if (!deps.includes(movedStateId)) orig.dependencies = [...deps, movedStateId];
			byId.set(orig.id, orig);
		}
	} else {
		// No next sequence; if K = 0 and moved has no deps, ensure it stays sequenced
		if (K === 0 && (!moved.dependencies || moved.dependencies.length === 0)) {
			if (moved.ordinal === undefined) moved.ordinal = 0;
		}
	}

	byId.set(moved.id, moved);
	return Array.from(byId.values());
}

/**
 * Reorder states within a sequence by assigning ordinal values.
 * Does not modify dependencies. Only states in the provided sequenceStateIds are re-assigned ordinals.
 */
export function reorderWithinSequence(
	states: State[],
	sequenceStateIds: string[],
	movedStateId: string,
	newIndex: number,
): State[] {
	const seqIds = sequenceStateIds.filter((id) => id && states.some((t) => t.id === id));
	const withoutMoved = seqIds.filter((id) => id !== movedStateId);
	const clampedIndex = Math.max(0, Math.min(withoutMoved.length, newIndex));
	const newOrder = [...withoutMoved.slice(0, clampedIndex), movedStateId, ...withoutMoved.slice(clampedIndex)];

	const byId = new Map<string, State>(states.map((t) => [t.id, { ...t }]));
	newOrder.forEach((id, idx) => {
		const t = byId.get(id);
		if (t) {
			t.ordinal = idx;
			byId.set(id, t);
		}
	});
	return Array.from(byId.values());
}

/**
 * Plan a move into a target sequence using join semantics.
 * Returns only the states that changed (dependencies and/or ordinal).
 */
export function planMoveToSequence(
	allStates: State[],
	sequences: Sequence[],
	movedStateId: string,
	targetSequenceIndex: number,
): State[] {
	const updated = adjustDependenciesForMove(allStates, sequences, movedStateId, targetSequenceIndex);
	// If moving to Sequence 1 and resulting deps are empty, anchor with ordinal 0
	if (targetSequenceIndex === 1) {
		const movedU = updated.find((x) => x.id === movedStateId);
		if (movedU && (!movedU.dependencies || movedU.dependencies.length === 0)) {
			if (movedU.ordinal === undefined) movedU.ordinal = 0;
		}
	}
	const byIdOrig = new Map(allStates.map((t) => [t.id, t]));
	const changed: State[] = [];
	for (const u of updated) {
		const orig = byIdOrig.get(u.id);
		if (!orig) continue;
		const depsChanged = JSON.stringify(orig.dependencies) !== JSON.stringify(u.dependencies);
		const ordChanged = (orig.ordinal ?? null) !== (u.ordinal ?? null);
		if (depsChanged || ordChanged) changed.push(u);
	}
	return changed;
}

/**
 * Plan a move to Unsequenced. Returns changed states or an error message when not eligible.
 */
export function planMoveToUnsequenced(
	allStates: State[],
	movedStateId: string,
): { ok: true; changed: State[] } | { ok: false; error: string } {
	if (!canMoveToUnsequenced(allStates, movedStateId)) {
		return { ok: false, error: "Cannot move to Unsequenced: state has dependencies or dependents" };
	}
	const byId = new Map(allStates.map((t) => [t.id, { ...t }]));
	const moved = byId.get(movedStateId);
	if (!moved) return { ok: false, error: "State not found" };
	moved.dependencies = [];
	// Clear ordinal to ensure it is considered Unsequenced (no ordinal)
	if (moved.ordinal !== undefined) moved.ordinal = undefined;
	return { ok: true, changed: [moved] };
}
