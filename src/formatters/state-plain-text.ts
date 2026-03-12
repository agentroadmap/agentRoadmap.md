import type { State } from "../types/index.ts";
import type { ChecklistItem } from "../ui/checklist.ts";
import { transformCodePathsPlain } from "../ui/code-path.ts";
import { formatStatusWithIcon } from "../ui/status-icon.ts";
import { sortByStateId } from "../utils/state-sorting.ts";

export type StatePlainTextOptions = {
	filePathOverride?: string;
};

export function formatDateForDisplay(dateStr: string): string {
	if (!dateStr) return "";
	const hasTime = dateStr.includes(" ") || dateStr.includes("T");
	return hasTime ? dateStr : dateStr;
}

function buildChecklistItems(items: State["acceptanceCriteriaItems"]): ChecklistItem[] {
	const criteria = items ?? [];
	return criteria
		.slice()
		.sort((a, b) => a.index - b.index)
		.map((criterion, index) => ({
			text: `#${index + 1} ${criterion.text}`,
			checked: criterion.checked,
		}));
}

export function buildAcceptanceCriteriaItems(state: State): ChecklistItem[] {
	return buildChecklistItems(state.acceptanceCriteriaItems);
}

export function buildDefinitionOfDoneItems(state: State): ChecklistItem[] {
	return buildChecklistItems(state.definitionOfDoneItems);
}

export function formatAcceptanceCriteriaLines(items: ChecklistItem[]): string[] {
	if (items.length === 0) return [];
	return items.map((item) => {
		const prefix = item.checked ? "- [x]" : "- [ ]";
		return `${prefix} ${transformCodePathsPlain(item.text)}`;
	});
}

function formatPriority(priority?: "high" | "medium" | "low"): string | null {
	if (!priority) return null;
	const label = priority.charAt(0).toUpperCase() + priority.slice(1);
	return label;
}

function formatAssignees(assignee?: string[]): string | null {
	if (!assignee || assignee.length === 0) return null;
	return assignee.map((a) => (a.startsWith("@") ? a : `@${a}`)).join(", ");
}

function formatSubstateLines(substates: Array<{ id: string; title: string }>): string[] {
	if (substates.length === 0) return [];
	const sorted = sortByStateId(substates);
	return sorted.map((substate) => `- ${substate.id} - ${substate.title}`);
}

export function formatStatePlainText(state: State, options: StatePlainTextOptions = {}): string {
	const lines: string[] = [];
	const filePath = options.filePathOverride ?? state.filePath;

	if (filePath) {
		lines.push(`File: ${filePath}`);
		lines.push("");
	}

	lines.push(`State ${state.id} - ${state.title}`);
	if (state.type) lines.push(`Type: ${state.type.toUpperCase()}`);
	lines.push("=".repeat(50));
	lines.push("");
	lines.push(`Status: ${formatStatusWithIcon(state.status)}`);

	const priorityLabel = formatPriority(state.priority);
	if (priorityLabel) {
		lines.push(`Priority: ${priorityLabel}`);
	}

	const assigneeText = formatAssignees(state.assignee);
	if (assigneeText) {
		lines.push(`Assignee: ${assigneeText}`);
	}

	if (state.reporter) {
		const reporter = state.reporter.startsWith("@") ? state.reporter : `@${state.reporter}`;
		lines.push(`Reporter: ${reporter}`);
	}

	if (state.hype) lines.push(`Hype: ${state.hype}`);
	lines.push(`Created: ${formatDateForDisplay(state.createdDate)}`);
	if (state.updatedDate) {
		lines.push(`Updated: ${formatDateForDisplay(state.updatedDate)}`);
	}

	if (state.labels?.length) {
		lines.push(`Labels: ${state.labels.join(", ")}`);
	}

	if (state.milestone) {
		lines.push(`Milestone: ${state.milestone}`);
	}

	if (state.parentStateId) {
		const parentLabel = state.parentStateTitle ? `${state.parentStateId} - ${state.parentStateTitle}` : state.parentStateId;
		lines.push(`Parent: ${parentLabel}`);
	}

	const substateSummaries = state.substateSummaries ?? [];
	const substateCount = substateSummaries.length > 0 ? substateSummaries.length : (state.substates?.length ?? 0);
	if (substateCount > 0) {
		const substateLines = formatSubstateLines(substateSummaries);
		if (substateLines.length > 0) {
			lines.push(`Substates (${substateCount}):`);
			lines.push(...substateLines);
		} else {
			lines.push(`Substates: ${substateCount}`);
		}
	}

	if (state.dependencies?.length) {
		lines.push(`Dependencies: ${state.dependencies.join(", ")}`);
	}

	if (state.references?.length) {
		lines.push(`References: ${state.references.join(", ")}`);
	}

	if (state.documentation?.length) {
		lines.push(`Documentation: ${state.documentation.join(", ")}`);
	}

	lines.push("");
	lines.push("Description:");
	lines.push("-".repeat(50));
	const description = state.description?.trim();
	lines.push(transformCodePathsPlain(description && description.length > 0 ? description : "No description provided"));
	lines.push("");

	lines.push("Acceptance Criteria:");
	lines.push("-".repeat(50));
	const criteriaItems = buildAcceptanceCriteriaItems(state);
	if (criteriaItems.length > 0) {
		lines.push(...formatAcceptanceCriteriaLines(criteriaItems));
	} else {
		lines.push("No acceptance criteria defined");
	}
	lines.push("");

	lines.push("Definition of Done:");
	lines.push("-".repeat(50));
	const definitionItems = buildDefinitionOfDoneItems(state);
	if (definitionItems.length > 0) {
		lines.push(...formatAcceptanceCriteriaLines(definitionItems));
	} else {
		lines.push("No Definition of Done items defined");
	}
	lines.push("");

	const implementationPlan = state.implementationPlan?.trim();
	if (implementationPlan) {
		lines.push("Implementation Plan:");
		lines.push("-".repeat(50));
		lines.push(transformCodePathsPlain(implementationPlan));
		lines.push("");
	}

	const implementationNotes = state.implementationNotes?.trim();
	if (implementationNotes) {
		lines.push("Implementation Notes:");
		lines.push("-".repeat(50));
		lines.push(transformCodePathsPlain(implementationNotes));
		lines.push("");
	}

	const finalSummary = state.finalSummary?.trim();
	if (finalSummary) {
		lines.push("Final Summary:");
		lines.push("-".repeat(50));
		lines.push(transformCodePathsPlain(finalSummary));
		lines.push("");
	}

	return lines.join("\n");
}
