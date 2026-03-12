/**
 * Parse a state ID into its numeric components for proper sorting.
 * Handles both simple IDs (state-5) and decimal IDs (state-5.2.1).
 * Works with any prefix pattern (state-, draft-, JIRA-, etc.)
 */
export function parseStateId(stateId: string): number[] {
	// Remove any prefix pattern (letters followed by dash) - handles state-, draft-, JIRA-, etc.
	const numericPart = stateId.replace(/^[a-zA-Z]+-/i, "");

	// Try to extract numeric parts from the ID
	// First check if it's a standard numeric ID (e.g., "1", "1.2", etc.)
	const dotParts = numericPart.split(".");
	const numericParts = dotParts.map((part) => {
		const num = Number.parseInt(part, 10);
		return Number.isNaN(num) ? null : num;
	});

	// If all parts are numeric, return them
	if (numericParts.every((n) => n !== null)) {
		return numericParts as number[];
	}

	// Otherwise, try to extract trailing number (e.g., "draft2" -> 2)
	const trailingNumberMatch = numericPart.match(/(\d+)$/);
	if (trailingNumberMatch) {
		const [, num] = trailingNumberMatch;
		return [Number.parseInt(num ?? "0", 10)];
	}

	// No numeric parts found, return 0 for consistent sorting
	return [0];
}

/**
 * Compare two state IDs numerically.
 * Returns negative if a < b, positive if a > b, 0 if equal.
 *
 * Examples:
 * - state-2 comes before state-10
 * - state-2 comes before state-2.1
 * - state-2.1 comes before state-2.2
 * - state-2.2 comes before state-2.10
 */
export function compareStateIds(a: string, b: string): number {
	const aParts = parseStateId(a);
	const bParts = parseStateId(b);

	// Compare each numeric part
	const maxLength = Math.max(aParts.length, bParts.length);

	for (let i = 0; i < maxLength; i++) {
		const aNum = aParts[i] ?? 0;
		const bNum = bParts[i] ?? 0;

		if (aNum !== bNum) {
			return aNum - bNum;
		}
	}

	// All parts are equal
	return 0;
}

/**
 * Sort an array of objects by their state ID property numerically.
 * Returns a new sorted array without mutating the original.
 */
export function sortByStateId<T extends { id: string }>(items: T[]): T[] {
	return [...items].sort((a, b) => compareStateIds(a.id, b.id));
}

/**
 * Sort an array of states by their priority property.
 * Priority order: high > medium > low > undefined
 * States with the same priority are sorted by state ID.
 */
export function sortByPriority<T extends { id: string; priority?: "high" | "medium" | "low" }>(items: T[]): T[] {
	const priorityWeight = {
		high: 3,
		medium: 2,
		low: 1,
	};

	return [...items].sort((a, b) => {
		const aWeight = a.priority ? priorityWeight[a.priority] : 0;
		const bWeight = b.priority ? priorityWeight[b.priority] : 0;

		// First sort by priority (higher weight = higher priority)
		if (aWeight !== bWeight) {
			return bWeight - aWeight;
		}

		// If priorities are the same, sort by state ID
		return compareStateIds(a.id, b.id);
	});
}

/**
 * Sort an array of states by their ordinal property, then by state ID.
 * States with ordinal values come before states without.
 * States with the same ordinal (or both undefined) are sorted by state ID.
 */
export function sortByOrdinal<T extends { id: string; ordinal?: number }>(items: T[]): T[] {
	return [...items].sort((a, b) => {
		// States with ordinal come before states without
		if (a.ordinal !== undefined && b.ordinal === undefined) {
			return -1;
		}
		if (a.ordinal === undefined && b.ordinal !== undefined) {
			return 1;
		}

		// Both have ordinals - sort by ordinal value
		if (a.ordinal !== undefined && b.ordinal !== undefined) {
			if (a.ordinal !== b.ordinal) {
				return a.ordinal - b.ordinal;
			}
		}

		// Same ordinal (or both undefined) - sort by state ID
		return compareStateIds(a.id, b.id);
	});
}

/**
 * Sort an array of states considering ordinal first, then priority, then ID.
 * This is the default sorting for the board view.
 */
export function sortByOrdinalAndPriority<
	T extends { id: string; ordinal?: number; priority?: "high" | "medium" | "low" },
>(items: T[]): T[] {
	const priorityWeight = {
		high: 3,
		medium: 2,
		low: 1,
	};

	return [...items].sort((a, b) => {
		// States with ordinal come before states without
		if (a.ordinal !== undefined && b.ordinal === undefined) {
			return -1;
		}
		if (a.ordinal === undefined && b.ordinal !== undefined) {
			return 1;
		}

		// Both have ordinals - sort by ordinal value
		if (a.ordinal !== undefined && b.ordinal !== undefined) {
			if (a.ordinal !== b.ordinal) {
				return a.ordinal - b.ordinal;
			}
		}

		// Same ordinal (or both undefined) - sort by priority
		const aWeight = a.priority ? priorityWeight[a.priority] : 0;
		const bWeight = b.priority ? priorityWeight[b.priority] : 0;

		if (aWeight !== bWeight) {
			return bWeight - aWeight;
		}

		// Same priority - sort by state ID
		return compareStateIds(a.id, b.id);
	});
}

/**
 * Sort states by a specified field with fallback to state ID sorting.
 * Supported fields: 'priority', 'id', 'ordinal'
 */
export function sortStates<T extends { id: string; priority?: "high" | "medium" | "low"; ordinal?: number }>(
	items: T[],
	sortField: string,
): T[] {
	switch (sortField?.toLowerCase()) {
		case "priority":
			return sortByPriority(items);
		case "id":
			return sortByStateId(items);
		case "ordinal":
			return sortByOrdinal(items);
		default:
			// Default to ordinal + priority sorting for board view
			return sortByOrdinalAndPriority(items);
	}
}
