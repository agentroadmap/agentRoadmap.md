import { AcceptanceCriteriaManager } from "../../core/acceptance-criteria.ts";

type Sections = {
	description: string;
	criteria: ReturnType<typeof AcceptanceCriteriaManager.parseAcceptanceCriteria>;
	plan?: string;
	notes?: string;
};

function extractSection(body: string, title: string): string {
	if (!body) return "";
	const regex = new RegExp(`## ${title}\\s*\\n([\\s\\S]*?)(?=\\n## |$)`, "i");
	const match = body.match(regex);
	return match?.[1]?.trim() || "";
}

export function parseTaskSections(body: string): Sections {
	const description = extractSection(body, "Description");
	const criteria = AcceptanceCriteriaManager.parseAcceptanceCriteria(body);
	const plan = extractSection(body, "Implementation Plan");
	const notes = extractSection(body, "Implementation Notes");
	return { description, criteria, plan: plan || undefined, notes: notes || undefined };
}

export function composeTaskBody(baseBody: string, sections: Partial<Sections>): string {
	let result = baseBody || "";

	if (sections.description !== undefined) {
		// Inline minimal Description updater to avoid web importing serializer in UI bundle
		const regex = /## Description\s*\n([\s\S]*?)(?=\n## |$)/i;
		const newSection = `## Description\n\n${sections.description}`;
		if (regex.test(result)) {
			result = result.replace(regex, newSection);
		} else {
			result = `${newSection}${result ? `\n\n${result}` : ""}`;
		}
	}

	if (sections.criteria !== undefined) {
		result = AcceptanceCriteriaManager.updateContent(result, sections.criteria);
	}

	if (sections.plan !== undefined) {
		const regex = /## Implementation Plan\s*\n([\s\S]*?)(?=\n## |$)/i;
		const newSection = `## Implementation Plan\n\n${sections.plan}`;
		if (regex.test(result)) {
			result = result.replace(regex, newSection);
		} else if (sections.plan && sections.plan.trim()) {
			result = `${result}${result ? "\n\n" : ""}${newSection}`;
		}
	}

	if (sections.notes !== undefined) {
		const regex = /## Implementation Notes\s*\n([\s\S]*?)(?=\n## |$)/i;
		const newSection = `## Implementation Notes\n\n${sections.notes}`;
		if (regex.test(result)) {
			result = result.replace(regex, newSection);
		} else if (sections.notes && sections.notes.trim()) {
			result = `${result}${result ? "\n\n" : ""}${newSection}`;
		}
	}

	return result;
}
