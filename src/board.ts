import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import type { Milestone, State } from "./types/index.ts";

export interface BoardOptions {
	statuses?: string[];
}

export type BoardLayout = "horizontal" | "vertical";
export type BoardFormat = "terminal" | "markdown";

export function buildKanbanStatusGroups(
	states: State[],
	statuses: string[],
): { orderedStatuses: string[]; groupedStates: Map<string, State[]> } {
	const canonicalByLower = new Map<string, string>();
	const orderedConfiguredStatuses: string[] = [];
	const configuredSeen = new Set<string>();

	for (const status of statuses ?? []) {
		if (typeof status !== "string") continue;
		const trimmed = status.trim();
		if (!trimmed) continue;
		const lower = trimmed.toLowerCase();
		if (!canonicalByLower.has(lower)) {
			canonicalByLower.set(lower, trimmed);
		}
		if (!configuredSeen.has(trimmed)) {
			orderedConfiguredStatuses.push(trimmed);
			configuredSeen.add(trimmed);
		}
	}

	const groupedStates = new Map<string, State[]>();
	for (const status of orderedConfiguredStatuses) {
		groupedStates.set(status, []);
	}

	for (const state of states) {
		const raw = (state.status ?? "").trim();
		if (!raw) continue;
		const canonical = canonicalByLower.get(raw.toLowerCase()) ?? raw;
		if (!groupedStates.has(canonical)) {
			groupedStates.set(canonical, []);
		}
		groupedStates.get(canonical)?.push(state);
	}

	const orderedStatuses: string[] = [];
	const seen = new Set<string>();

	for (const status of orderedConfiguredStatuses) {
		if (seen.has(status)) continue;
		orderedStatuses.push(status);
		seen.add(status);
	}

	for (const status of groupedStates.keys()) {
		if (seen.has(status)) continue;
		orderedStatuses.push(status);
		seen.add(status);
	}

	return { orderedStatuses, groupedStates };
}

export function generateKanbanBoardWithMetadata(states: State[], statuses: string[], projectName: string): string {
	// Generate timestamp
	const now = new Date();
	const timestamp = now.toISOString().replace("T", " ").substring(0, 19);

	const { orderedStatuses, groupedStates } = buildKanbanStatusGroups(states, statuses);

	// Create header
	const header = `# Kanban Board Export (powered by Roadmap.md)
Generated on: ${timestamp}
Project: ${projectName}

`;

	// Return early if there are no configured statuses and no states
	if (orderedStatuses.length === 0) {
		return `${header}No states found.`;
	}

	// Create table header
	const headerRow = `| ${orderedStatuses.map((status) => status || "No Status").join(" | ")} |`;
	const separatorRow = `| ${orderedStatuses.map(() => "---").join(" | ")} |`;

	// Map for quick lookup by id
	const byId = new Map<string, State>(states.map((t) => [t.id, t]));

	// Group states by status and handle parent-child relationships
	const columns: State[][] = orderedStatuses.map((status) => {
		const items = groupedStates.get(status) || [];
		const top: State[] = [];
		const children = new Map<string, State[]>();

		// Sort items: All columns by updatedDate descending (fallback to createdDate), then by ID as secondary
		const sortedItems = items.sort((a, b) => {
			// Primary sort: updatedDate (newest first), fallback to createdDate if updatedDate is missing
			const dateA = a.updatedDate ? new Date(a.updatedDate).getTime() : new Date(a.createdDate).getTime();
			const dateB = b.updatedDate ? new Date(b.updatedDate).getTime() : new Date(b.createdDate).getTime();
			if (dateB !== dateA) {
				return dateB - dateA; // Newest first
			}
			// Secondary sort: ID descending when dates are equal
			const idA = Number.parseInt(a.id.replace("state-", ""), 10);
			const idB = Number.parseInt(b.id.replace("state-", ""), 10);
			return idB - idA; // Highest ID first (newest)
		});

		// Separate top-level states from substates
		for (const t of sortedItems) {
			const parent = t.parentStateId ? byId.get(t.parentStateId) : undefined;
			if (parent && parent.status === t.status) {
				// Substate with same status as parent - group under parent
				const list = children.get(parent.id) || [];
				list.push(t);
				children.set(parent.id, list);
			} else {
				// Top-level state or substate with different status
				top.push(t);
			}
		}

		// Build final list with substates nested under parents
		const result: State[] = [];
		for (const t of top) {
			result.push(t);
			const subs = children.get(t.id) || [];
			subs.sort((a, b) => {
				const idA = Number.parseInt(a.id.replace("state-", ""), 10);
				const idB = Number.parseInt(b.id.replace("state-", ""), 10);
				return idA - idB; // Substates in ascending order
			});
			result.push(...subs);
		}

		return result;
	});

	const maxStates = Math.max(...columns.map((c) => c.length), 0);
	const rows = [headerRow, separatorRow];

	for (let stateIdx = 0; stateIdx < maxStates; stateIdx++) {
		const row = orderedStatuses.map((_, cIdx) => {
			const state = columns[cIdx]?.[stateIdx];
			if (!state || !state.id || !state.title) return "";

			// Check if this is a substate
			const isSubstate = state.parentStateId;
			const stateIdPrefix = isSubstate ? "└─ " : "";
			const stateIdUpper = state.id.toUpperCase();

			// Format assignees in brackets or empty string if none
			// Add @ prefix only if not already present
			const assigneesText =
				state.assignee && state.assignee.length > 0
					? ` [${state.assignee.map((a) => (a.startsWith("@") ? a : `@${a}`)).join(", ")}]`
					: "";

			// Format labels with # prefix and italic or empty string if none
			const labelsText =
				state.labels && state.labels.length > 0 ? `<br>*${state.labels.map((label) => `#${label}`).join(" ")}*` : "";

			return `${stateIdPrefix}**${stateIdUpper}** - ${state.title}${assigneesText}${labelsText}`;
		});
		rows.push(`| ${row.join(" | ")} |`);
	}

	const table = `${rows.join("\n")}`;
	if (maxStates === 0) {
		return `${header}${table}\n\nNo states found.\n`;
	}

	return `${header}${table}\n`;
}

export function generateMilestoneGroupedBoard(
	states: State[],
	statuses: string[],
	milestoneEntities: Milestone[],
	projectName: string,
): string {
	const now = new Date();
	const timestamp = now.toISOString().replace("T", " ").substring(0, 19);

	// Collect canonical milestone identifiers from milestone files and states.
	// State values can be either IDs or titles, so normalize aliases to one key.
	const milestoneSeen = new Set<string>();
	const allMilestones: string[] = [];
	const aliasToMilestone = new Map<string, string>();
	const milestoneLabelsByKey = new Map<string, string>();
	const titleCounts = new Map<string, number>();
	for (const milestone of milestoneEntities) {
		const titleKey = milestone.title.trim().toLowerCase();
		if (!titleKey) continue;
		titleCounts.set(titleKey, (titleCounts.get(titleKey) ?? 0) + 1);
	}

	for (const milestone of milestoneEntities) {
		const normalizedId = milestone.id.trim();
		const normalizedTitle = milestone.title.trim();
		const idKey = normalizedId.toLowerCase();
		if (normalizedId && !milestoneSeen.has(idKey)) {
			milestoneSeen.add(idKey);
			allMilestones.push(normalizedId);
		}

		if (normalizedId) {
			aliasToMilestone.set(idKey, normalizedId);
			const idAliasMatch = normalizedId.match(/^m-(\d+)$/i);
			if (idAliasMatch?.[1]) {
				const numericAlias = String(Number.parseInt(idAliasMatch[1], 10));
				aliasToMilestone.set(`m-${numericAlias}`, normalizedId);
				if (!aliasToMilestone.has(numericAlias)) {
					aliasToMilestone.set(numericAlias, normalizedId);
				}
			}
		}
		if (normalizedTitle) {
			const titleKey = normalizedTitle.toLowerCase();
			if (titleCounts.get(titleKey) === 1 && !aliasToMilestone.has(titleKey)) {
				aliasToMilestone.set(titleKey, normalizedId || normalizedTitle);
			}
			milestoneLabelsByKey.set(idKey, normalizedTitle);
			if (titleCounts.get(titleKey) === 1 && !milestoneLabelsByKey.has(titleKey)) {
				milestoneLabelsByKey.set(titleKey, normalizedTitle);
			}
		}
	}

	const canonicalizeMilestone = (value?: string | null): string => {
		const normalized = value?.trim();
		if (!normalized) return "";
		const direct = aliasToMilestone.get(normalized.toLowerCase());
		if (direct) {
			return direct;
		}
		const idMatch = normalized.match(/^m-(\d+)$/i);
		if (idMatch?.[1]) {
			const numericAlias = String(Number.parseInt(idMatch[1], 10));
			return aliasToMilestone.get(`m-${numericAlias}`) ?? aliasToMilestone.get(numericAlias) ?? normalized;
		}
		if (/^\d+$/.test(normalized)) {
			const numericAlias = String(Number.parseInt(normalized, 10));
			return aliasToMilestone.get(`m-${numericAlias}`) ?? aliasToMilestone.get(numericAlias) ?? normalized;
		}
		return normalized;
	};

	for (const state of states) {
		const canonicalMilestone = canonicalizeMilestone(state.milestone);
		if (canonicalMilestone && !milestoneSeen.has(canonicalMilestone.toLowerCase())) {
			milestoneSeen.add(canonicalMilestone.toLowerCase());
			allMilestones.push(canonicalMilestone);
		}
	}

	const header = `# Kanban Board by Milestone (powered by Roadmap.md)
Generated on: ${timestamp}
Project: ${projectName}

`;

	const sections: string[] = [];

	// No milestone section
	const noMilestoneStates = states.filter((t) => !t.milestone?.trim());
	if (noMilestoneStates.length > 0) {
		sections.push(generateMilestoneSection("No Milestone", noMilestoneStates, statuses));
	}

	// Each milestone section
	for (const milestone of allMilestones) {
		const milestoneStates = states.filter(
			(state) => canonicalizeMilestone(state.milestone).toLowerCase() === milestone.toLowerCase(),
		);
		if (milestoneStates.length > 0) {
			const milestoneLabel = milestoneLabelsByKey.get(milestone.toLowerCase()) ?? milestone;
			sections.push(generateMilestoneSection(milestoneLabel, milestoneStates, statuses));
		}
	}

	if (sections.length === 0) {
		return `${header}No states found.\n`;
	}

	return `${header}${sections.join("\n\n")}\n`;
}

function generateMilestoneSection(milestone: string, states: State[], statuses: string[]): string {
	const { orderedStatuses, groupedStates } = buildKanbanStatusGroups(states, statuses);

	const sectionHeader = `## ${milestone} (${states.length} states)\n`;

	if (orderedStatuses.length === 0) {
		return `${sectionHeader}\nNo states.\n`;
	}

	const statusLines = orderedStatuses.map((status) => {
		const statusStates = groupedStates.get(status) || [];
		const stateLines = statusStates.map((t) => {
			const id = t.id.toUpperCase();
			const assignees = t.assignee?.length ? ` [@${t.assignee.join(", @")}]` : "";
			return `  - **${id}** - ${t.title}${assignees}`;
		});
		return `### ${status} (${statusStates.length})\n${stateLines.length > 0 ? stateLines.join("\n") : "  (empty)"}`;
	});

	return `${sectionHeader}\n${statusLines.join("\n\n")}`;
}

export async function exportKanbanBoardToFile(
	states: State[],
	statuses: string[],
	filePath: string,
	projectName: string,
	_overwrite = false,
): Promise<void> {
	const board = generateKanbanBoardWithMetadata(states, statuses, projectName);

	// Ensure directory exists
	try {
		await mkdir(dirname(filePath), { recursive: true });
	} catch {
		// Directory might already exist
	}

	// Write the content (overwrite mode)
	await Bun.write(filePath, board);
}
