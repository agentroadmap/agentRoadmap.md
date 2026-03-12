import { type RoadmapConfig, EntityType, type PrefixConfig } from "../types/index.ts";

/**
 * Default prefix configuration for states.
 */
export const DEFAULT_PREFIX_CONFIG: PrefixConfig = {
	state: "state",
};

/**
 * Hardcoded draft prefix. Not configurable - always "draft".
 */
export const DRAFT_PREFIX = "draft";

/**
 * Returns the default prefix configuration.
 * Use this when no custom config is specified.
 */
export function getDefaultPrefixConfig(): PrefixConfig {
	return { ...DEFAULT_PREFIX_CONFIG };
}

/**
 * Merges user-provided prefix config with defaults.
 * Missing fields are filled with default values.
 *
 * @param config - Partial prefix config from user
 * @returns Complete prefix config with defaults applied
 */
export function mergePrefixConfig(config?: Partial<PrefixConfig>): PrefixConfig {
	return {
		state: config?.state ?? DEFAULT_PREFIX_CONFIG.state,
	};
}

/**
 * Normalizes an ID to ensure it has the correct prefix (uppercase).
 * If the ID already has the prefix (case-insensitive), it normalizes to uppercase.
 * If the ID is numeric only, it adds the uppercase prefix.
 *
 * @param id - The ID to normalize (e.g., "123", "state-123", "STATE-123")
 * @param prefix - The prefix to use (e.g., "state", "draft", "JIRA")
 * @returns Normalized ID with uppercase prefix (e.g., "STATE-123")
 *
 * @example
 * normalizeId("123", "state") // => "STATE-123"
 * normalizeId("state-123", "state") // => "STATE-123"
 * normalizeId("STATE-123", "state") // => "STATE-123"
 * normalizeId("jira-456", "JIRA") // => "JIRA-456"
 */
export function normalizeId(id: string, prefix: string): string {
	const trimmed = id.trim();
	const upperPrefix = prefix.toUpperCase();
	const prefixPattern = new RegExp(`^${escapeRegex(prefix)}-(.+)$`, "i");
	const match = trimmed.match(prefixPattern);
	const body = match?.[1] ?? trimmed;
	return `${upperPrefix}-${body.toUpperCase()}`;
}

/**
 * Extracts the numeric/body part from an ID, removing the prefix.
 * Returns the body portion that follows the prefix.
 *
 * @param id - The ID to extract from (e.g., "state-123", "JIRA-456.1")
 * @param prefix - The prefix to strip (e.g., "state", "JIRA")
 * @returns The body portion without prefix, or the original if no prefix match
 *
 * @example
 * extractIdBody("state-123", "state") // => "123"
 * extractIdBody("JIRA-456.1", "JIRA") // => "456.1"
 * extractIdBody("123", "state") // => "123"
 */
export function extractIdBody(id: string, prefix: string): string {
	const trimmed = id.trim();
	const prefixPattern = new RegExp(`^${escapeRegex(prefix)}-(.+)$`, "i");
	const match = trimmed.match(prefixPattern);
	return match?.[1] ?? trimmed;
}

/**
 * Extracts the numeric parts from an ID as an array of numbers.
 * Handles both simple IDs (state-5) and hierarchical IDs (state-5.2.1).
 *
 * @param id - The ID to parse (e.g., "state-123", "state-5.2.1")
 * @param prefix - The prefix to strip (e.g., "state")
 * @returns Array of numeric segments, or [0] if unparseable
 *
 * @example
 * extractIdNumbers("state-123", "state") // => [123]
 * extractIdNumbers("state-5.2.1", "state") // => [5, 2, 1]
 * extractIdNumbers("state-abc", "state") // => [0]
 */
export function extractIdNumbers(id: string, prefix: string): number[] {
	const body = extractIdBody(id, prefix);
	const segments = body.split(".").map((seg) => {
		const num = Number.parseInt(seg, 10);
		return Number.isNaN(num) ? 0 : num;
	});
	return segments.length > 0 ? segments : [0];
}

/**
 * Builds a glob pattern for finding files with a specific prefix.
 *
 * @param prefix - The prefix to match (e.g., "state", "draft")
 * @returns Glob pattern (e.g., "state-*.md")
 *
 * @example
 * buildGlobPattern("state") // => "state-*.md"
 * buildGlobPattern("JIRA") // => "JIRA-*.md"
 */
export function buildGlobPattern(prefix: string): string {
	return `${prefix}-*.md`;
}

/**
 * Builds a regex pattern for matching IDs with a specific prefix.
 * Captures the numeric/body portion after the prefix.
 *
 * @param prefix - The prefix to match (e.g., "state", "draft")
 * @returns RegExp that matches IDs and captures the body (e.g., /^state-(\d+(?:\.\d+)*)/)
 *
 * @example
 * const regex = buildIdRegex("state");
 * "state-123".match(regex) // => ["state-123", "123"]
 * "state-5.2.1".match(regex) // => ["state-5.2.1", "5.2.1"]
 */
export function buildIdRegex(prefix: string): RegExp {
	return new RegExp(`^${escapeRegex(prefix)}-(\\d+(?:\\.\\d+)*)`, "i");
}

/**
 * Builds a regex pattern for extracting IDs from filenames.
 * Similar to buildIdRegex but designed for filename parsing.
 *
 * @param prefix - The prefix to match (e.g., "state", "draft")
 * @returns RegExp for filename matching
 *
 * @example
 * const regex = buildFilenameIdRegex("state");
 * "state-123 - Some Title.md".match(regex) // => ["state-123", "123"]
 */
export function buildFilenameIdRegex(prefix: string): RegExp {
	return new RegExp(`^${escapeRegex(prefix)}-(\\d+(?:\\.\\d+)*)`, "i");
}

/**
 * Builds a regex pattern for extracting IDs from file paths.
 * Unlike buildIdRegex, this doesn't use ^ anchor so it can match IDs
 * anywhere in a file path string.
 *
 * @param prefix - The prefix to match (e.g., "state", "draft")
 * @returns RegExp for path matching (matches anywhere in string)
 *
 * @example
 * const regex = buildPathIdRegex("state");
 * "roadmap/states/state-123 - Title.md".match(regex) // => ["state-123", "123"]
 * "state-5.2.1 - Substate.md".match(regex) // => ["state-5.2.1", "5.2.1"]
 */
export function buildPathIdRegex(prefix: string): RegExp {
	return new RegExp(`${escapeRegex(prefix)}-(\\d+(?:\\.\\d+)*)`, "i");
}

/**
 * Checks if an ID matches a given prefix pattern.
 *
 * @param id - The ID to check
 * @param prefix - The prefix to match against
 * @returns true if the ID starts with the prefix pattern
 *
 * @example
 * hasPrefix("state-123", "state") // => true
 * hasPrefix("STATE-123", "state") // => true (case-insensitive)
 * hasPrefix("draft-1", "state") // => false
 */
export function hasPrefix(id: string, prefix: string): boolean {
	const pattern = new RegExp(`^${escapeRegex(prefix)}-`, "i");
	return pattern.test(id.trim());
}

/**
 * Checks if an ID has any valid prefix pattern (letters followed by dash).
 * Use this for filtering/validation when you want to accept any prefix.
 *
 * @param id - The ID to check
 * @returns true if the ID matches the pattern: letters-dash-something
 *
 * @example
 * hasAnyPrefix("state-123") // => true
 * hasAnyPrefix("JIRA-456") // => true
 * hasAnyPrefix("draft-1") // => true
 * hasAnyPrefix("123") // => false
 * hasAnyPrefix("") // => false
 */
export function hasAnyPrefix(id: string): boolean {
	if (!id || typeof id !== "string") return false;
	return /^[a-zA-Z]+-\S/.test(id.trim());
}

/**
 * Strips any prefix from an ID (e.g., "state-123" -> "123", "JIRA-456" -> "456").
 * Use this when you need the body/number part without the prefix.
 *
 * @param id - The ID to strip
 * @returns The ID without its prefix, or the original if no prefix
 *
 * @example
 * stripAnyPrefix("state-123") // => "123"
 * stripAnyPrefix("JIRA-456.1") // => "456.1"
 * stripAnyPrefix("123") // => "123"
 */
export function stripAnyPrefix(id: string): string {
	if (!id || typeof id !== "string") return id;
	return id.trim().replace(/^[a-zA-Z]+-/, "");
}

/**
 * Extracts the prefix from an ID (e.g., "state-123" -> "state", "JIRA-456" -> "JIRA").
 * Returns null if the ID has no valid prefix pattern.
 *
 * @param id - The ID to extract from
 * @returns The prefix (lowercase), or null if no prefix
 *
 * @example
 * extractAnyPrefix("state-123") // => "state"
 * extractAnyPrefix("JIRA-456") // => "jira"
 * extractAnyPrefix("123") // => null
 */
export function extractAnyPrefix(id: string): string | null {
	if (!id || typeof id !== "string") return null;
	const match = id.trim().match(/^([a-zA-Z]+)-/);
	return match?.[1] ? match[1].toLowerCase() : null;
}

/**
 * Compares two IDs for equality, ignoring case in the prefix.
 *
 * @param id1 - First ID
 * @param id2 - Second ID
 * @param prefix - The prefix both IDs should have
 * @returns true if the IDs are equivalent
 *
 * @example
 * idsEqual("state-123", "STATE-123", "state") // => true
 * idsEqual("state-1", "state-01", "state") // => false (different body)
 */
export function idsEqual(id1: string, id2: string, prefix: string): boolean {
	return normalizeId(id1, prefix).toLowerCase() === normalizeId(id2, prefix).toLowerCase();
}

/**
 * Generates the next ID in sequence given a list of existing IDs.
 *
 * @param existingIds - Array of existing IDs
 * @param prefix - The prefix to use
 * @param zeroPadding - Optional zero padding width (e.g., 3 for "001")
 * @returns Next ID in sequence (e.g., "state-43")
 *
 * @example
 * generateNextId(["state-1", "state-2", "state-5"], "state") // => "state-6"
 * generateNextId(["state-001", "state-002"], "state", 3) // => "state-003"
 */
export function generateNextId(existingIds: string[], prefix: string, zeroPadding?: number): string {
	const regex = buildIdRegex(prefix);
	const upperPrefix = prefix.toUpperCase();
	let max = 0;

	for (const id of existingIds) {
		const match = id.match(regex);
		if (match?.[1]) {
			// Only consider top-level IDs (no dots for substates)
			const body = match[1];
			if (!body.includes(".")) {
				const num = Number.parseInt(body, 10);
				if (!Number.isNaN(num) && num > max) {
					max = num;
				}
			}
		}
	}

	const nextNum = max + 1;

	if (zeroPadding && zeroPadding > 0) {
		return `${upperPrefix}-${String(nextNum).padStart(zeroPadding, "0")}`;
	}

	return `${upperPrefix}-${nextNum}`;
}

/**
 * Generates the next substate ID for a parent state.
 *
 * @param existingIds - Array of existing IDs (including substates)
 * @param parentId - The parent state ID (e.g., "state-5")
 * @param prefix - The prefix being used
 * @param zeroPadding - Optional zero padding width for substate number
 * @returns Next substate ID (e.g., "state-5.3")
 *
 * @example
 * generateNextSubstateId(["state-5", "state-5.1", "state-5.2"], "state-5", "state") // => "state-5.3"
 */
export function generateNextSubstateId(
	existingIds: string[],
	parentId: string,
	prefix: string,
	zeroPadding?: number,
): string {
	const normalizedParent = normalizeId(parentId, prefix);
	const parentBody = extractIdBody(normalizedParent, prefix);

	let max = 0;

	for (const id of existingIds) {
		const body = extractIdBody(id, prefix);
		if (body.startsWith(`${parentBody}.`)) {
			const rest = body.slice(parentBody.length + 1);
			const firstSegment = rest.split(".")[0];
			if (firstSegment) {
				const num = Number.parseInt(firstSegment, 10);
				if (!Number.isNaN(num) && num > max) {
					max = num;
				}
			}
		}
	}

	const nextNum = max + 1;

	if (zeroPadding && zeroPadding > 0) {
		return `${normalizedParent}.${String(nextNum).padStart(2, "0")}`;
	}

	return `${normalizedParent}.${nextNum}`;
}

/**
 * Converts an ID to lowercase format for use in filenames.
 * IDs are uppercase (STATE-123) but filenames use lowercase (state-123 - Title.md).
 *
 * @param id - The ID to convert (e.g., "STATE-123", "DRAFT-5")
 * @returns Lowercase version for filenames (e.g., "state-123", "draft-5")
 *
 * @example
 * idForFilename("STATE-123") // => "state-123"
 * idForFilename("DRAFT-5") // => "draft-5"
 */
export function idForFilename(id: string): string {
	return id.toLowerCase();
}

/**
 * Escapes special regex characters in a string.
 * Used to safely build regex patterns from user-provided prefixes.
 *
 * @param str - The string to escape
 * @returns String with regex special characters escaped
 *
 * @example
 * escapeRegex("state-") // => "state-"
 * escapeRegex("JIRA.") // => "JIRA\\."
 */
export function escapeRegex(str: string): string {
	return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Gets the prefix for a given entity type.
 * Only states have configurable prefixes (via config); other types use hardcoded prefixes.
 *
 * @param type - The entity type
 * @param config - Optional roadmap config (only used for State type)
 * @returns The prefix string for the entity type
 *
 * @example
 * getPrefixForType(EntityType.State) // => "state"
 * getPrefixForType(EntityType.State, { prefixes: { state: "JIRA" } }) // => "JIRA"
 * getPrefixForType(EntityType.Draft) // => "draft"
 * getPrefixForType(EntityType.Document) // => "doc"
 * getPrefixForType(EntityType.Decision) // => "decision"
 */
export function getPrefixForType(type: EntityType, config?: RoadmapConfig): string {
	switch (type) {
		case EntityType.State:
			return config?.prefixes?.state ?? DEFAULT_PREFIX_CONFIG.state;
		case EntityType.Draft:
			return DRAFT_PREFIX;
		case EntityType.Document:
			return "doc";
		case EntityType.Decision:
			return "decision";
		default:
			return type;
	}
}
