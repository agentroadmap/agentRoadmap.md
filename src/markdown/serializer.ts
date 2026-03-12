import matter from "gray-matter";
import type { Decision, Document, State } from "../types/index.ts";
import { normalizeAssignee } from "../utils/assignee.ts";
import {
	AcceptanceCriteriaManager,
	DefinitionOfDoneManager,
	getStructuredSections,
	updateStructuredSections,
} from "./structured-sections.ts";

export function serializeState(state: State): string {
	normalizeAssignee(state);
	const frontmatter = {
		id: state.id,
		title: state.title,
		status: state.status,
		assignee: state.assignee,
		...(state.reporter && { reporter: state.reporter }),
		created_date: state.createdDate,
		...(state.updatedDate && { updated_date: state.updatedDate }),
		labels: state.labels,
		...(state.milestone && { milestone: state.milestone }),
		dependencies: state.dependencies,
		...(state.references && state.references.length > 0 && { references: state.references }),
		...(state.documentation && state.documentation.length > 0 && { documentation: state.documentation }),
		...(state.parentStateId && { parent_state_id: state.parentStateId }),
		...(state.substates && state.substates.length > 0 && { substates: state.substates }),
		...(state.priority && { priority: state.priority }),
		...(state.ordinal !== undefined && { ordinal: state.ordinal }),
		...(state.onStatusChange && { onStatusChange: state.onStatusChange }),
	};

	let contentBody = state.rawContent ?? "";
	if (typeof state.description === "string" && state.description.trim() !== "") {
		contentBody = updateStateDescription(contentBody, state.description);
	}
	if (Array.isArray(state.acceptanceCriteriaItems)) {
		const existingCriteria = AcceptanceCriteriaManager.parseAllCriteria(state.rawContent ?? "");
		const hasExistingStructuredCriteria = existingCriteria.length > 0;
		if (state.acceptanceCriteriaItems.length > 0 || hasExistingStructuredCriteria) {
			contentBody = AcceptanceCriteriaManager.updateContent(contentBody, state.acceptanceCriteriaItems);
		}
	}
	if (Array.isArray(state.definitionOfDoneItems)) {
		const existingDefinitionOfDone = DefinitionOfDoneManager.parseAllCriteria(state.rawContent ?? "");
		const hasExistingDefinitionOfDone = existingDefinitionOfDone.length > 0;
		if (state.definitionOfDoneItems.length > 0 || hasExistingDefinitionOfDone) {
			contentBody = DefinitionOfDoneManager.updateContent(contentBody, state.definitionOfDoneItems);
		}
	}
	if (typeof state.implementationPlan === "string") {
		contentBody = updateStateImplementationPlan(contentBody, state.implementationPlan);
	}
	if (typeof state.implementationNotes === "string") {
		contentBody = updateStateImplementationNotes(contentBody, state.implementationNotes);
	}
	if (typeof state.finalSummary === "string") {
		contentBody = updateStateFinalSummary(contentBody, state.finalSummary);
	}

	const serialized = matter.stringify(contentBody, frontmatter);
	// Ensure there's a blank line between frontmatter and content
	return serialized.replace(/^(---\n(?:.*\n)*?---)\n(?!$)/, "$1\n\n");
}

export function serializeDecision(decision: Decision): string {
	const frontmatter = {
		id: decision.id,
		title: decision.title,
		date: decision.date,
		status: decision.status,
	};

	let content = `## Context\n\n${decision.context}\n\n`;
	content += `## Decision\n\n${decision.decision}\n\n`;
	content += `## Consequences\n\n${decision.consequences}`;

	if (decision.alternatives) {
		content += `\n\n## Alternatives\n\n${decision.alternatives}`;
	}

	return matter.stringify(content, frontmatter);
}

export function serializeDocument(document: Document): string {
	const frontmatter = {
		id: document.id,
		title: document.title,
		type: document.type,
		created_date: document.createdDate,
		...(document.updatedDate && { updated_date: document.updatedDate }),
		...(document.tags && document.tags.length > 0 && { tags: document.tags }),
	};

	return matter.stringify(document.rawContent, frontmatter);
}

export function updateStateAcceptanceCriteria(content: string, criteria: string[]): string {
	// Normalize to LF while computing, preserve original EOL at return
	const useCRLF = /\r\n/.test(content);
	const src = content.replace(/\r\n/g, "\n");
	// Find if there's already an Acceptance Criteria section
	const criteriaRegex = /## Acceptance Criteria\s*\n([\s\S]*?)(?=\n## |$)/i;
	const match = src.match(criteriaRegex);

	const newCriteria = criteria.map((criterion) => `- [ ] ${criterion}`).join("\n");
	const newSection = `## Acceptance Criteria\n\n${newCriteria}`;

	let out: string | undefined;
	if (match) {
		// Replace existing section
		out = src.replace(criteriaRegex, newSection);
	} else {
		// Add new section at the end
		out = `${src}\n\n${newSection}`;
	}
	return useCRLF ? out.replace(/\n/g, "\r\n") : out;
}

export function updateStateImplementationPlan(content: string, plan: string): string {
	const sections = getStructuredSections(content);
	return updateStructuredSections(content, {
		description: sections.description ?? "",
		implementationPlan: plan,
		implementationNotes: sections.implementationNotes ?? "",
		finalSummary: sections.finalSummary ?? "",
	});
}

export function updateStateImplementationNotes(content: string, notes: string): string {
	const sections = getStructuredSections(content);
	return updateStructuredSections(content, {
		description: sections.description ?? "",
		implementationPlan: sections.implementationPlan ?? "",
		implementationNotes: notes,
		finalSummary: sections.finalSummary ?? "",
	});
}

export function updateStateFinalSummary(content: string, summary: string): string {
	const sections = getStructuredSections(content);
	return updateStructuredSections(content, {
		description: sections.description ?? "",
		implementationPlan: sections.implementationPlan ?? "",
		implementationNotes: sections.implementationNotes ?? "",
		finalSummary: summary,
	});
}

export function appendStateImplementationNotes(content: string, notesChunks: string | string[]): string {
	const chunks = (Array.isArray(notesChunks) ? notesChunks : [notesChunks])
		.map((c) => String(c))
		.map((c) => c.replace(/\r\n/g, "\n"))
		.map((c) => c.trim())
		.filter(Boolean);

	const sections = getStructuredSections(content);
	const appendedBlock = chunks.join("\n\n");
	const existingNotes = sections.implementationNotes?.trim();
	const combined = existingNotes ? `${existingNotes}\n\n${appendedBlock}` : appendedBlock;
	return updateStructuredSections(content, {
		description: sections.description ?? "",
		implementationPlan: sections.implementationPlan ?? "",
		implementationNotes: combined,
		finalSummary: sections.finalSummary ?? "",
	});
}

export function updateStateDescription(content: string, description: string): string {
	const sections = getStructuredSections(content);
	return updateStructuredSections(content, {
		description,
		implementationPlan: sections.implementationPlan ?? "",
		implementationNotes: sections.implementationNotes ?? "",
		finalSummary: sections.finalSummary ?? "",
	});
}
