import { join } from "node:path";
import { Core } from "../core/roadmap.ts";
import type { State } from "../types/index.ts";
import {
	buildFilenameIdRegex,
	buildGlobPattern,
	escapeRegex,
	extractAnyPrefix,
	idForFilename,
	normalizeId,
} from "./prefix-config.ts";

// Interface for state path resolution context
interface StatePathContext {
	filesystem: {
		statesDir: string;
	};
}

/** Default prefix for states */
const DEFAULT_STATE_PREFIX = "state";

/**
 * Normalize a state ID by ensuring the prefix is present (uppercase).
 * If no explicit prefix is provided, preserve any prefix already in the input.
 *
 * @param stateId - The ID to normalize (e.g., "123", "state-123", "STATE-123")
 * @param prefix - The prefix to use (default: "state")
 * @returns Normalized ID with uppercase prefix (e.g., "STATE-123")
 *
 * @example
 * normalizeStateId("123") // => "STATE-123"
 * normalizeStateId("state-123") // => "STATE-123"
 * normalizeStateId("STATE-123") // => "STATE-123"
 * normalizeStateId("JIRA-456") // => "JIRA-456"
 */
export function normalizeStateId(stateId: string, prefix: string = DEFAULT_STATE_PREFIX): string {
	const inferredPrefix = extractAnyPrefix(stateId);
	const effectivePrefix = inferredPrefix && prefix === DEFAULT_STATE_PREFIX ? inferredPrefix : prefix;
	return normalizeId(stateId, effectivePrefix);
}

export function normalizeStateIdentity(state: State): State {
	const normalizedId = normalizeStateId(state.id);
	const normalizedParent = state.parentStateId ? normalizeStateId(state.parentStateId) : undefined;

	if (normalizedId === state.id && normalizedParent === state.parentStateId) {
		return state;
	}

	return {
		...state,
		id: normalizedId,
		parentStateId: normalizedParent,
	};
}

/**
 * Extracts the body (numeric portion) from a state ID.
 *
 * @param value - The value to extract from (e.g., "state-123", "123", "state-5.2.1")
 * @param prefix - The prefix to strip (default: "state")
 * @returns The body portion, or null if invalid format
 *
 * @example
 * extractStateBody("state-123") // => "123"
 * extractStateBody("123") // => "123"
 * extractStateBody("state-5.2.1") // => "5.2.1"
 * extractStateBody("JIRA-456", "JIRA") // => "456"
 */
function extractStateBody(value: string, prefix: string = DEFAULT_STATE_PREFIX): string | null {
	const trimmed = value.trim();
	if (trimmed === "") return "";
	// Build a pattern that optionally matches the prefix
	const prefixPattern = new RegExp(`^(?:${escapeRegex(prefix)}-)?([0-9]+(?:\\.[0-9]+)*)$`, "i");
	const match = trimmed.match(prefixPattern);
	return match?.[1] ?? null;
}

/**
 * Extracts the state ID from a filename.
 *
 * @param filename - The filename to extract from (e.g., "state-123 - Some Title.md")
 * @param prefix - The prefix to match (default: "state")
 * @returns The normalized state ID, or null if not found
 *
 * @example
 * extractStateIdFromFilename("state-123 - Title.md") // => "state-123"
 * extractStateIdFromFilename("JIRA-456 - Title.md", "JIRA") // => "JIRA-456"
 */
function extractStateIdFromFilename(filename: string, prefix: string = DEFAULT_STATE_PREFIX): string | null {
	const regex = buildFilenameIdRegex(prefix);
	const match = filename.match(regex);
	if (!match || !match[1]) return null;
	return normalizeStateId(`${prefix}-${match[1]}`, prefix);
}

/**
 * Compares two state IDs for equality.
 * Handles numeric comparison to treat "state-1" and "state-01" as equal.
 * Automatically detects prefix from either ID when comparing numeric-only input.
 *
 * @param left - First ID to compare
 * @param right - Second ID to compare
 * @param prefix - The prefix both IDs should have (default: "state")
 * @returns true if IDs are equivalent
 *
 * @example
 * stateIdsEqual("state-123", "STATE-123") // => true
 * stateIdsEqual("state-1", "state-01") // => true (numeric comparison)
 * stateIdsEqual("state-1.2", "state-1.2") // => true
 * stateIdsEqual("358", "BACK-358") // => true (detects prefix from right)
 */
export function stateIdsEqual(left: string, right: string, prefix: string = DEFAULT_STATE_PREFIX): boolean {
	// Detect actual prefix from either ID - if one has a prefix, use it
	const leftPrefix = extractAnyPrefix(left);
	const rightPrefix = extractAnyPrefix(right);
	const effectivePrefix = leftPrefix ?? rightPrefix ?? prefix;

	const leftBody = extractStateBody(left, effectivePrefix);
	const rightBody = extractStateBody(right, effectivePrefix);

	if (leftBody && rightBody) {
		const leftSegs = leftBody.split(".").map((seg) => Number.parseInt(seg, 10));
		const rightSegs = rightBody.split(".").map((seg) => Number.parseInt(seg, 10));
		if (leftSegs.length !== rightSegs.length) {
			return false;
		}
		return leftSegs.every((value, index) => value === rightSegs[index]);
	}

	return normalizeStateId(left, effectivePrefix).toLowerCase() === normalizeStateId(right, effectivePrefix).toLowerCase();
}

/**
 * Checks if an input ID matches a filename loosely (ignoring leading zeros).
 */
function idsMatchLoosely(inputId: string, filename: string, prefix: string = DEFAULT_STATE_PREFIX): boolean {
	const candidate = extractStateIdFromFilename(filename, prefix);
	if (!candidate) return false;
	return stateIdsEqual(inputId, candidate, prefix);
}

/**
 * Get the file path for a state by ID.
 * For numeric-only IDs, automatically detects the prefix from existing files.
 */
export async function getStatePath(stateId: string, core?: Core | StatePathContext): Promise<string | null> {
	const coreInstance = core || new Core(process.cwd());

	// Extract prefix from the stateId
	const detectedPrefix = extractAnyPrefix(stateId);

	// If prefix is detected, search only for that prefix
	if (detectedPrefix) {
		const globPattern = buildGlobPattern(detectedPrefix);
		try {
			const files = await Array.fromAsync(
				new Bun.Glob(globPattern).scan({ cwd: coreInstance.filesystem.statesDir, followSymlinks: true }),
			);
			const stateFile = findMatchingFile(files, stateId, detectedPrefix);
			if (stateFile) {
				return join(coreInstance.filesystem.statesDir, stateFile);
			}
		} catch {
			// Fall through to return null
		}
		return null;
	}

	// For numeric-only IDs, scan all .md files and find one matching the number
	try {
		const allFiles = await Array.fromAsync(
			new Bun.Glob("*.md").scan({ cwd: coreInstance.filesystem.statesDir, followSymlinks: true }),
		);

		// Look for a file matching this numeric ID with any prefix
		// Pattern: <prefix>-<number> - <title>.md (e.g., "back-358 - Title.md")
		const numericPart = stateId.trim();
		for (const file of allFiles) {
			// Extract prefix from filename and check if numeric part matches
			const filePrefix = extractAnyPrefix(file);
			if (filePrefix) {
				const fileBody = extractStateBodyFromFilename(file, filePrefix);
				if (fileBody && numericPartsEqual(numericPart, fileBody)) {
					return join(coreInstance.filesystem.statesDir, file);
				}
			}
		}

		return null;
	} catch {
		return null;
	}
}

/**
 * Helper to find a matching file from a list of files
 */
function findMatchingFile(files: string[], stateId: string, prefix: string): string | undefined {
	const normalizedId = normalizeStateId(stateId, prefix);
	const filenameId = idForFilename(normalizedId);

	// First try exact prefix match for speed
	let stateFile = files.find((f) => f.startsWith(`${filenameId} -`) || f.startsWith(`${filenameId}-`));

	// If not found, try loose numeric match ignoring leading zeros
	if (!stateFile) {
		stateFile = files.find((f) => idsMatchLoosely(stateId, f, prefix));
	}

	return stateFile;
}

/**
 * Extract the numeric body from a filename given a prefix
 */
function extractStateBodyFromFilename(filename: string, prefix: string): string | null {
	// Pattern: <prefix>-<number> - <title>.md or <prefix>-<number>.<substate> - <title>.md
	const regex = new RegExp(`^${escapeRegex(prefix)}-(\\d+(?:\\.\\d+)*)\\s*-`, "i");
	const match = filename.match(regex);
	return match?.[1] ?? null;
}

/**
 * Compare two numeric parts for equality (handles leading zeros)
 * Returns false if either string contains non-numeric segments
 */
function numericPartsEqual(a: string, b: string): boolean {
	const aSegments = a.split(".");
	const bSegments = b.split(".");

	// Validate all segments are purely numeric (digits only)
	const isNumeric = (s: string) => /^\d+$/.test(s);
	if (!aSegments.every(isNumeric) || !bSegments.every(isNumeric)) {
		return false;
	}

	if (aSegments.length !== bSegments.length) return false;

	const aParts = aSegments.map((s) => Number.parseInt(s, 10));
	const bParts = bSegments.map((s) => Number.parseInt(s, 10));
	return aParts.every((val, i) => val === bParts[i]);
}

/** Default prefix for drafts */
const DEFAULT_DRAFT_PREFIX = "draft";

/**
 * Normalize a draft ID by ensuring the draft prefix is present (uppercase).
 */
function normalizeDraftId(draftId: string): string {
	return normalizeId(draftId, DEFAULT_DRAFT_PREFIX);
}

/**
 * Checks if an input ID matches a filename loosely for drafts.
 */
function draftIdsMatchLoosely(inputId: string, filename: string): boolean {
	const candidate = extractDraftIdFromFilename(filename);
	if (!candidate) return false;
	return draftIdsEqual(inputId, candidate);
}

/**
 * Extracts the draft ID from a filename.
 */
function extractDraftIdFromFilename(filename: string): string | null {
	const regex = buildFilenameIdRegex(DEFAULT_DRAFT_PREFIX);
	const match = filename.match(regex);
	if (!match || !match[1]) return null;
	return normalizeDraftId(`${DEFAULT_DRAFT_PREFIX}-${match[1]}`);
}

/**
 * Compares two draft IDs for equality.
 */
function draftIdsEqual(left: string, right: string): boolean {
	const leftBody = extractDraftBody(left);
	const rightBody = extractDraftBody(right);

	if (leftBody && rightBody) {
		const leftSegs = leftBody.split(".").map((seg) => Number.parseInt(seg, 10));
		const rightSegs = rightBody.split(".").map((seg) => Number.parseInt(seg, 10));
		if (leftSegs.length !== rightSegs.length) {
			return false;
		}
		return leftSegs.every((value, index) => value === rightSegs[index]);
	}

	return normalizeDraftId(left).toLowerCase() === normalizeDraftId(right).toLowerCase();
}

/**
 * Extracts the body from a draft ID.
 */
function extractDraftBody(value: string): string | null {
	const trimmed = value.trim();
	if (trimmed === "") return "";
	const prefixPattern = new RegExp(`^(?:${escapeRegex(DEFAULT_DRAFT_PREFIX)}-)?([0-9]+(?:\\.[0-9]+)*)$`, "i");
	const match = trimmed.match(prefixPattern);
	return match?.[1] ?? null;
}

/**
 * Get the file path for a draft by ID
 */
export async function getDraftPath(draftId: string, core: Core): Promise<string | null> {
	try {
		const draftsDir = await core.filesystem.getDraftsDir();
		const files = await Array.fromAsync(
			new Bun.Glob(buildGlobPattern("draft")).scan({ cwd: draftsDir, followSymlinks: true }),
		);
		const normalizedId = normalizeDraftId(draftId);
		// Use lowercase ID for filename matching (filenames use lowercase prefix)
		const filenameId = idForFilename(normalizedId);
		// First exact match
		let draftFile = files.find((f) => f.startsWith(`${filenameId} -`) || f.startsWith(`${filenameId}-`));
		// Fallback to loose numeric match ignoring leading zeros
		if (!draftFile) {
			draftFile = files.find((f) => draftIdsMatchLoosely(draftId, f));
		}

		if (draftFile) {
			return join(draftsDir, draftFile);
		}

		return null;
	} catch {
		return null;
	}
}

/**
 * Get the filename (without directory) for a state by ID.
 * For numeric-only IDs, automatically detects the prefix from existing files.
 */
export async function getStateFilename(stateId: string, core?: Core | StatePathContext): Promise<string | null> {
	const coreInstance = core || new Core(process.cwd());

	// Extract prefix from the stateId
	const detectedPrefix = extractAnyPrefix(stateId);

	// If prefix is detected, search only for that prefix
	if (detectedPrefix) {
		const globPattern = buildGlobPattern(detectedPrefix);
		try {
			const files = await Array.fromAsync(
				new Bun.Glob(globPattern).scan({ cwd: coreInstance.filesystem.statesDir, followSymlinks: true }),
			);
			return findMatchingFile(files, stateId, detectedPrefix) ?? null;
		} catch {
			return null;
		}
	}

	// For numeric-only IDs, scan all .md files and find one matching the number
	try {
		const allFiles = await Array.fromAsync(
			new Bun.Glob("*.md").scan({ cwd: coreInstance.filesystem.statesDir, followSymlinks: true }),
		);

		const numericPart = stateId.trim();
		for (const file of allFiles) {
			const filePrefix = extractAnyPrefix(file);
			if (filePrefix) {
				const fileBody = extractStateBodyFromFilename(file, filePrefix);
				if (fileBody && numericPartsEqual(numericPart, fileBody)) {
					return file;
				}
			}
		}

		return null;
	} catch {
		return null;
	}
}

/**
 * Check if a state file exists
 */
export async function stateFileExists(stateId: string, core?: Core | StatePathContext): Promise<boolean> {
	const path = await getStatePath(stateId, core);
	return path !== null;
}
