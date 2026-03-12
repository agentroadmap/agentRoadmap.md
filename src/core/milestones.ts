import type { Milestone, MilestoneBucket, MilestoneSummary, State } from "../types/index.ts";

const NO_MILESTONE_KEY = "__none";

/**
 * Normalize a milestone name/ID by trimming whitespace
 */
export function normalizeMilestoneName(name: string): string {
	return name.trim();
}

/**
 * Get a lowercase key for milestone comparison
 */
export function milestoneKey(name?: string | null): string {
	return normalizeMilestoneName(name ?? "").toLowerCase();
}

/**
 * Collect archived milestone keys, excluding archived titles that are reused by active milestones.
 */
export function collectArchivedMilestoneKeys(archivedMilestones: Milestone[], activeMilestones: Milestone[]): string[] {
	const keys = new Set<string>();
	const activeTitleKeys = new Set(activeMilestones.map((milestone) => milestoneKey(milestone.title)).filter(Boolean));

	for (const milestone of archivedMilestones) {
		const idKey = milestoneKey(milestone.id);
		if (idKey) {
			keys.add(idKey);
		}
		const titleKey = milestoneKey(milestone.title);
		if (titleKey && !activeTitleKeys.has(titleKey)) {
			keys.add(titleKey);
		}
	}

	return Array.from(keys);
}

/**
 * Validate a milestone name for creation
 */
export function validateMilestoneName(name: string, existingMilestones: string[]): string | null {
	const normalizedName = normalizeMilestoneName(name);
	if (!normalizedName) {
		return "Milestone name cannot be empty.";
	}

	const normalizedExisting = existingMilestones.map((milestone) => milestoneKey(milestone)).filter(Boolean);

	if (normalizedExisting.includes(milestoneKey(normalizedName))) {
		return "Milestone already exists.";
	}

	return null;
}

function buildMilestoneAliasMap(
	milestoneEntities: Milestone[],
	archivedMilestones: Milestone[] = [],
): Map<string, string> {
	const aliasMap = new Map<string, string>();
	const collectIdAliasKeys = (value: string): string[] => {
		const idKey = milestoneKey(value);
		if (!idKey) return [];
		const keys = new Set<string>([idKey]);
		if (/^\d+$/.test(value.trim())) {
			const numericAlias = String(Number.parseInt(value.trim(), 10));
			keys.add(numericAlias);
			keys.add(`m-${numericAlias}`);
			return Array.from(keys);
		}
		const idMatch = value.trim().match(/^m-(\d+)$/i);
		if (idMatch?.[1]) {
			const numericAlias = String(Number.parseInt(idMatch[1], 10));
			keys.add(`m-${numericAlias}`);
			keys.add(numericAlias);
		}
		return Array.from(keys);
	};
	const reservedIdKeys = new Set<string>();
	for (const milestone of [...milestoneEntities, ...archivedMilestones]) {
		for (const key of collectIdAliasKeys(milestone.id)) {
			reservedIdKeys.add(key);
		}
	}
	const setAlias = (aliasKey: string, normalizedId: string, allowOverwrite: boolean): void => {
		const existing = aliasMap.get(aliasKey);
		if (!existing) {
			aliasMap.set(aliasKey, normalizedId);
			return;
		}
		if (!allowOverwrite) {
			return;
		}
		const existingKey = existing.toLowerCase();
		const nextKey = normalizedId.toLowerCase();
		const preferredRawId = /^\d+$/.test(aliasKey) ? `m-${aliasKey}` : /^m-\d+$/.test(aliasKey) ? aliasKey : null;
		if (preferredRawId) {
			const existingIsPreferred = existingKey === preferredRawId;
			const nextIsPreferred = nextKey === preferredRawId;
			if (existingIsPreferred && !nextIsPreferred) {
				return;
			}
			if (nextIsPreferred && !existingIsPreferred) {
				aliasMap.set(aliasKey, normalizedId);
			}
			return;
		}
		aliasMap.set(aliasKey, normalizedId);
	};
	const addIdAliases = (normalizedId: string, options?: { allowOverwrite?: boolean }) => {
		const allowOverwrite = options?.allowOverwrite ?? true;
		const idKey = milestoneKey(normalizedId);
		if (idKey) {
			setAlias(idKey, normalizedId, allowOverwrite);
		}
		const idMatch = normalizedId.match(/^m-(\d+)$/i);
		if (!idMatch?.[1]) {
			return;
		}
		const numericAlias = String(Number.parseInt(idMatch[1], 10));
		const canonicalId = `m-${numericAlias}`;
		if (canonicalId) {
			setAlias(canonicalId, normalizedId, allowOverwrite);
		}
		if (numericAlias) {
			setAlias(numericAlias, normalizedId, allowOverwrite);
		}
	};
	const activeTitleCounts = new Map<string, number>();
	for (const milestone of milestoneEntities) {
		const titleKey = milestoneKey(milestone.title);
		if (!titleKey) continue;
		activeTitleCounts.set(titleKey, (activeTitleCounts.get(titleKey) ?? 0) + 1);
	}
	const activeTitleKeys = new Set(activeTitleCounts.keys());

	for (const milestone of milestoneEntities) {
		const normalizedId = normalizeMilestoneName(milestone.id);
		const normalizedTitle = normalizeMilestoneName(milestone.title);
		if (!normalizedId) continue;
		addIdAliases(normalizedId);
		const titleKey = milestoneKey(normalizedTitle);
		if (titleKey && !reservedIdKeys.has(titleKey) && activeTitleCounts.get(titleKey) === 1) {
			if (!aliasMap.has(titleKey)) {
				aliasMap.set(titleKey, normalizedId);
			}
		}
	}

	const archivedTitleCounts = new Map<string, number>();
	for (const milestone of archivedMilestones) {
		const titleKey = milestoneKey(milestone.title);
		if (!titleKey || activeTitleKeys.has(titleKey)) continue;
		archivedTitleCounts.set(titleKey, (archivedTitleCounts.get(titleKey) ?? 0) + 1);
	}

	for (const milestone of archivedMilestones) {
		const normalizedId = normalizeMilestoneName(milestone.id);
		const normalizedTitle = normalizeMilestoneName(milestone.title);
		if (!normalizedId) continue;
		addIdAliases(normalizedId, { allowOverwrite: false });
		const titleKey = milestoneKey(normalizedTitle);
		if (!titleKey || activeTitleKeys.has(titleKey) || reservedIdKeys.has(titleKey)) continue;
		if (archivedTitleCounts.get(titleKey) === 1) {
			if (!aliasMap.has(titleKey)) {
				aliasMap.set(titleKey, normalizedId);
			}
		}
	}

	return aliasMap;
}

function canonicalizeMilestoneValue(value: string | null | undefined, aliasMap: Map<string, string>): string {
	const normalized = normalizeMilestoneName(value ?? "");
	if (!normalized) return "";
	const normalizedKey = milestoneKey(normalized);
	const direct = aliasMap.get(normalizedKey);
	if (direct) {
		return direct;
	}
	const idMatch = normalized.match(/^m-(\d+)$/i);
	if (idMatch?.[1]) {
		const numericAlias = String(Number.parseInt(idMatch[1], 10));
		return aliasMap.get(`m-${numericAlias}`) ?? aliasMap.get(numericAlias) ?? normalized;
	}
	if (/^\d+$/.test(normalized)) {
		const numericAlias = String(Number.parseInt(normalized, 10));
		return aliasMap.get(`m-${numericAlias}`) ?? aliasMap.get(numericAlias) ?? normalized;
	}
	return normalized;
}

function canonicalizeStateMilestones(
	states: State[],
	milestoneEntities: Milestone[],
	archivedMilestones: Milestone[] = [],
): State[] {
	const aliasMap = buildMilestoneAliasMap(milestoneEntities, archivedMilestones);
	return states.map((state) => {
		const canonicalMilestone = canonicalizeMilestoneValue(state.milestone, aliasMap);
		if (state.milestone === canonicalMilestone) {
			return state;
		}
		return {
			...state,
			milestone: canonicalMilestone || undefined,
		};
	});
}

/**
 * Collect all unique milestone IDs from states and milestone entities
 */
export function collectMilestoneIds(
	states: State[],
	milestoneEntities: Milestone[],
	archivedMilestones: Milestone[] = [],
): string[] {
	const merged: string[] = [];
	const seen = new Set<string>();
	const aliasMap = buildMilestoneAliasMap(milestoneEntities, archivedMilestones);

	const addMilestone = (value: string) => {
		const normalized = normalizeMilestoneName(value);
		if (!normalized) return;
		const key = milestoneKey(normalized);
		if (seen.has(key)) return;
		seen.add(key);
		merged.push(normalized);
	};

	// Add milestone entities first (they have priority for ordering)
	for (const entity of milestoneEntities) {
		addMilestone(entity.id);
	}

	// Then add any milestones from states that aren't in entities
	for (const state of states) {
		addMilestone(canonicalizeMilestoneValue(state.milestone, aliasMap));
	}

	return merged;
}

/**
 * Get the display label for a milestone
 * Uses the milestone entity title if available, otherwise returns the ID
 */
export function getMilestoneLabel(milestoneId: string | undefined, milestoneEntities: Milestone[]): string {
	if (!milestoneId) {
		return "States without milestone";
	}
	const entity = milestoneEntities.find((m) => milestoneKey(m.id) === milestoneKey(milestoneId));
	return entity?.title || milestoneId;
}

/**
 * Check if a status represents a "done" state
 */
export function isDoneStatus(status?: string | null): boolean {
	const normalized = (status ?? "").toLowerCase();
	return normalized.includes("done") || normalized.includes("complete");
}

/**
 * Create a milestone bucket for a given milestone
 */
function createBucket(
	milestoneId: string | undefined,
	states: State[],
	statuses: string[],
	milestoneEntities: Milestone[],
	isNoMilestone: boolean,
): MilestoneBucket {
	const bucketMilestoneKey = milestoneKey(milestoneId);
	const bucketStates = states.filter((state) => {
		const stateMilestoneKey = milestoneKey(state.milestone);
		return bucketMilestoneKey ? stateMilestoneKey === bucketMilestoneKey : !stateMilestoneKey;
	});

	const counts: Record<string, number> = {};
	for (const status of statuses) {
		counts[status] = 0;
	}
	for (const state of bucketStates) {
		const status = state.status ?? "";
		counts[status] = (counts[status] ?? 0) + 1;
	}

	const doneCount = bucketStates.filter((t) => isDoneStatus(t.status)).length;
	const progress = bucketStates.length > 0 ? Math.round((doneCount / bucketStates.length) * 100) : 0;
	const isCompleted = bucketStates.length > 0 && doneCount === bucketStates.length;

	const key = bucketMilestoneKey ? bucketMilestoneKey : NO_MILESTONE_KEY;
	const label = getMilestoneLabel(milestoneId, milestoneEntities);

	return {
		key,
		label,
		milestone: milestoneId,
		isNoMilestone,
		isCompleted,
		states: bucketStates,
		statusCounts: counts,
		total: bucketStates.length,
		doneCount,
		progress,
	};
}

/**
 * Build milestone buckets from states and milestone entities
 */
export function buildMilestoneBuckets(
	states: State[],
	milestoneEntities: Milestone[],
	statuses: string[],
	options?: { archivedMilestoneIds?: string[]; archivedMilestones?: Milestone[] },
): MilestoneBucket[] {
	const archivedKeys = new Set((options?.archivedMilestoneIds ?? []).map((id) => milestoneKey(id)));
	const canonicalStates = canonicalizeStateMilestones(states, milestoneEntities, options?.archivedMilestones ?? []);
	const normalizedStates =
		archivedKeys.size > 0
			? canonicalStates.map((state) => {
					const key = milestoneKey(state.milestone);
					if (!key || !archivedKeys.has(key)) {
						return state;
					}
					return { ...state, milestone: undefined };
				})
			: canonicalStates;
	const filteredMilestones =
		archivedKeys.size > 0
			? milestoneEntities.filter((milestone) => !archivedKeys.has(milestoneKey(milestone.id)))
			: milestoneEntities;

	const allMilestoneIds = collectMilestoneIds(normalizedStates, filteredMilestones);

	const buckets: MilestoneBucket[] = [
		createBucket(undefined, normalizedStates, statuses, filteredMilestones, true),
		...allMilestoneIds.map((m) => createBucket(m, normalizedStates, statuses, filteredMilestones, false)),
	];

	return buckets;
}

/**
 * Build a complete milestone summary
 */
export function buildMilestoneSummary(
	states: State[],
	milestoneEntities: Milestone[],
	statuses: string[],
	options?: { archivedMilestoneIds?: string[]; archivedMilestones?: Milestone[] },
): MilestoneSummary {
	const archivedKeys = new Set((options?.archivedMilestoneIds ?? []).map((id) => milestoneKey(id)));
	const canonicalStates = canonicalizeStateMilestones(states, milestoneEntities, options?.archivedMilestones ?? []);
	const normalizedStates =
		archivedKeys.size > 0
			? canonicalStates.map((state) => {
					const key = milestoneKey(state.milestone);
					if (!key || !archivedKeys.has(key)) {
						return state;
					}
					return { ...state, milestone: undefined };
				})
			: canonicalStates;
	const filteredMilestones =
		archivedKeys.size > 0
			? milestoneEntities.filter((milestone) => !archivedKeys.has(milestoneKey(milestone.id)))
			: milestoneEntities;
	const milestones = collectMilestoneIds(normalizedStates, filteredMilestones, options?.archivedMilestones ?? []);
	const buckets = buildMilestoneBuckets(normalizedStates, filteredMilestones, statuses, options);

	return {
		milestones,
		buckets,
	};
}
