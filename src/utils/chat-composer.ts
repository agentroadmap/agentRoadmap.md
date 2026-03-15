import { readdirSync } from "node:fs";
import { basename, dirname, join, relative } from "node:path";

export interface ChatComposerState {
	lines: string[];
	mentionSelection?: {
		query: string;
		index: number;
	};
}

export interface ChatComposerKey {
	name?: string;
	ctrl?: boolean;
	meta?: boolean;
	shift?: boolean;
	sequence?: string;
}

export interface ChatPathEntry {
	name: string;
	isDirectory: boolean;
}

export interface ChatMentionSuggestion {
	value: string;
	selected: boolean;
}

interface ChatPathCompletionOptions {
	homeDir?: string;
	listDirectory?: (directory: string) => ChatPathEntry[];
}

export type ChatComposerResult =
	| { type: "update"; state: ChatComposerState }
	| { type: "send"; state: ChatComposerState; message: string }
	| { type: "exit"; state: ChatComposerState };

export function createChatComposerState(): ChatComposerState {
	return { lines: [""] };
}

export function getChatComposerText(state: ChatComposerState): string {
	return state.lines.join("\n");
}

export function renderChatComposerLines(state: ChatComposerState): string[] {
	const lines = state.lines.length > 0 ? state.lines : [""];
	return lines.map((line, index) => `${index === 0 ? "> " : "| "}${line}`);
}

function appendText(state: ChatComposerState, text: string): ChatComposerState {
	const normalized = text.replace(/\r\n?/g, "\n");
	if (normalized.length === 0) return state;

	const parts = normalized.split("\n");
	const nextLines = [...state.lines];
	nextLines[nextLines.length - 1] = `${nextLines[nextLines.length - 1] ?? ""}${parts[0] ?? ""}`;
	for (let index = 1; index < parts.length; index++) {
		nextLines.push(parts[index] ?? "");
	}
	return { lines: nextLines };
}

function removeLastCharacter(state: ChatComposerState): ChatComposerState {
	const nextLines = [...state.lines];
	const lastIndex = nextLines.length - 1;
	const currentLine = nextLines[lastIndex] ?? "";

	if (currentLine.length > 0) {
		nextLines[lastIndex] = currentLine.slice(0, -1);
		return { lines: nextLines };
	}

	if (nextLines.length > 1) {
		const removed = nextLines.pop() ?? "";
		nextLines[nextLines.length - 1] = `${nextLines[nextLines.length - 1] ?? ""}${removed}`;
	}

	return { lines: nextLines };
}

function normalizeDraftForSend(state: ChatComposerState): string | null {
	const raw = getChatComposerText(state).replace(/\r\n?/g, "\n");
	const trimmedEnd = raw.replace(/\s+$/u, "");
	if (trimmedEnd.trim().length === 0) {
		return null;
	}
	return trimmedEnd;
}

export function completeChatMention(state: ChatComposerState, knownUsers: string[]): ChatComposerState {
	return cycleChatMention(state, knownUsers, 1);
}

export function getChatMentionSuggestions(
	state: ChatComposerState,
	knownUsers: string[],
	limit = 8,
): ChatMentionSuggestion[] {
	const context = getActiveMentionContext(state, knownUsers, limit);
	if (!context) return [];

	return context.matches.map((user, index) => ({
		value: `@${user}`,
		selected: index === context.selectedIndex,
	}));
}

function normalizeChatMentionHandle(user: string): string {
	return user
		.trim()
		.replace(/\s*\(.*\)$/u, "")
		.toLowerCase()
		.replace(/[^a-z0-9_-]+/g, "-")
		.replace(/^-+|-+$/g, "");
}

function getChatMentionCandidates(knownUsers: string[]): string[] {
	return [...new Set(knownUsers.map(normalizeChatMentionHandle).filter((user) => user.length > 0))].sort(
		(left, right) => left.localeCompare(right),
	);
}

function getActiveMentionContext(
	state: ChatComposerState,
	knownUsers: string[],
	limit = 8,
): {
	currentLine: string;
	matches: string[];
	query: string;
	replaceStart: number;
	selectedIndex: number;
	selectionApplied: boolean;
} | null {
	const currentLine = state.lines[state.lines.length - 1] ?? "";
	const mentionMatch = currentLine.match(/(^|\s)@([a-zA-Z0-9_-]*)$/);
	if (!mentionMatch) return null;

	const token = (mentionMatch[2] ?? "").toLowerCase();
	const candidates = getChatMentionCandidates(knownUsers);
	const getMatches = (query: string) => candidates.filter((user) => user.startsWith(query)).slice(0, limit);
	const fallbackMatches = getMatches(token);

	let query = token;
	let matches = fallbackMatches;
	let selectedIndex = matches.indexOf(token);
	let selectionApplied = selectedIndex >= 0;

	if (state.mentionSelection) {
		const savedQuery = state.mentionSelection.query.toLowerCase();
		const savedMatches = getMatches(savedQuery);
		if (savedMatches.length > 0) {
			const boundedIndex = Math.max(0, Math.min(state.mentionSelection.index, savedMatches.length - 1));
			const selectedValue = savedMatches[boundedIndex] ?? "";
			if (token === savedQuery || token === selectedValue) {
				query = savedQuery;
				matches = savedMatches;
				selectedIndex = boundedIndex;
				selectionApplied = token === selectedValue;
			}
		}
	}

	if (matches.length === 0) return null;
	if (selectedIndex < 0) {
		selectedIndex = 0;
		selectionApplied = false;
	}

	return {
		currentLine,
		matches,
		query,
		replaceStart: currentLine.length - token.length - 1,
		selectedIndex,
		selectionApplied,
	};
}

export function cycleChatMention(state: ChatComposerState, knownUsers: string[], direction = 1): ChatComposerState {
	const context = getActiveMentionContext(state, knownUsers);
	if (!context) return state;

	let nextIndex = context.selectedIndex;
	if (context.selectionApplied) {
		nextIndex = (context.selectedIndex + (direction >= 0 ? 1 : -1) + context.matches.length) % context.matches.length;
	} else if (direction < 0) {
		nextIndex = context.matches.length - 1;
	}

	const nextLines = [...state.lines];
	const lastIndex = nextLines.length - 1;
	nextLines[lastIndex] = `${context.currentLine.slice(0, context.replaceStart)}@${context.matches[nextIndex] ?? ""}`;

	return {
		lines: nextLines,
		mentionSelection: {
			query: context.query,
			index: nextIndex,
		},
	};
}

export function acceptChatMention(state: ChatComposerState, knownUsers: string[]): ChatComposerState {
	const context = getActiveMentionContext(state, knownUsers);
	if (!context) return state;

	const nextLines = [...state.lines];
	const lastIndex = nextLines.length - 1;
	nextLines[lastIndex] =
		`${context.currentLine.slice(0, context.replaceStart)}@${context.matches[context.selectedIndex] ?? ""} `;
	return { lines: nextLines };
}

function listDirectoryEntries(directory: string): ChatPathEntry[] {
	return readdirSync(directory, { withFileTypes: true }).map((entry) => ({
		name: entry.name,
		isDirectory: entry.isDirectory(),
	}));
}

function longestCommonPrefix(values: string[]): string {
	if (values.length === 0) return "";
	let prefix = values[0] ?? "";
	for (let index = 1; index < values.length; index += 1) {
		const value = values[index] ?? "";
		let shared = 0;
		while (shared < prefix.length && shared < value.length && prefix[shared] === value[shared]) {
			shared += 1;
		}
		prefix = prefix.slice(0, shared);
		if (prefix.length === 0) break;
	}
	return prefix;
}

export function completeChatPath(state: ChatComposerState, options: ChatPathCompletionOptions = {}): ChatComposerState {
	const homeDir = options.homeDir ?? process.env.HOME;
	const listDirectory = options.listDirectory ?? listDirectoryEntries;
	const nextLines = [...state.lines];
	const lastIndex = nextLines.length - 1;
	const currentLine = nextLines[lastIndex] ?? "";
	const pathMatch = currentLine.match(/(?:^|\s)((?:~\/|\/)\S*)$/);
	if (!pathMatch) return state;

	const rawToken = pathMatch[1] ?? "";
	if (rawToken.startsWith("~/") && !homeDir) return state;

	const expandedToken = rawToken.startsWith("~/") ? `${homeDir}/${rawToken.slice(2)}` : rawToken;
	const resolvedHomeDir = homeDir ?? "";
	const tokenEndsInSlash = rawToken.endsWith("/");
	const searchDirectory = tokenEndsInSlash ? expandedToken : dirname(expandedToken);
	const namePrefix = tokenEndsInSlash ? "" : basename(expandedToken);

	let entries: ChatPathEntry[];
	try {
		entries = listDirectory(searchDirectory);
	} catch {
		return state;
	}

	const visibleEntries = entries
		.filter((entry) => namePrefix.startsWith(".") || !entry.name.startsWith("."))
		.filter((entry) => entry.name.startsWith(namePrefix))
		.sort((left, right) => left.name.localeCompare(right.name));
	if (visibleEntries.length === 0) return state;

	const displayCandidates = visibleEntries.map((entry) => {
		const expandedCandidate = tokenEndsInSlash ? `${expandedToken}${entry.name}` : join(searchDirectory, entry.name);
		const displayCandidate = rawToken.startsWith("~/")
			? `~/${relative(resolvedHomeDir, expandedCandidate).replace(/\\/g, "/")}`
			: expandedCandidate;
		return entry.isDirectory ? `${displayCandidate}/` : displayCandidate;
	});

	const replacement =
		displayCandidates.length === 1 ? (displayCandidates[0] ?? rawToken) : longestCommonPrefix(displayCandidates);
	if (!replacement || replacement === rawToken) return state;

	const replaceStart = currentLine.length - rawToken.length;
	nextLines[lastIndex] = `${currentLine.slice(0, replaceStart)}${replacement}`;
	return { lines: nextLines };
}

export function applyChatComposerKey(state: ChatComposerState, key: ChatComposerKey, chunk = ""): ChatComposerResult {
	if (key.ctrl && key.name === "c") {
		return { type: "exit", state };
	}

	if (key.name === "backspace") {
		return { type: "update", state: removeLastCharacter(state) };
	}

	if (key.name === "return" || key.name === "enter") {
		if (key.meta || key.shift) {
			return { type: "update", state: appendText(state, "\n") };
		}

		const message = normalizeDraftForSend(state);
		if (!message) {
			return { type: "update", state: createChatComposerState() };
		}

		return { type: "send", state: createChatComposerState(), message };
	}

	if (key.name === "tab") {
		return { type: "update", state };
	}

	if (["up", "down", "left", "right", "escape", "home", "end", "delete"].includes(key.name ?? "")) {
		return { type: "update", state };
	}

	const sequence = chunk.length > 0 ? chunk : (key.sequence ?? "");
	if (!sequence || (key.ctrl && !key.meta)) {
		return { type: "update", state };
	}

	return { type: "update", state: appendText(state, sequence) };
}
