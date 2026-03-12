/**
 * Helper functions for parsing markdown responses in MCP tests
 */

/**
 * Parse sequence create markdown response into structured data
 */
export function parseSequenceCreateMarkdown(markdown: string) {
	const lines = markdown.split("\n");

	// Extract metadata from Summary table
	const metadata: Record<string, string | number | boolean | null> = {};
	let inSummaryTable = false;

	for (const line of lines) {
		if (line.trim() === "## Summary") {
			inSummaryTable = true;
			continue;
		}
		if (inSummaryTable && line.startsWith("| ") && !line.includes("Metric")) {
			const match = line.match(/\|\s*(.+?)\s*\|\s*(.+?)\s*\|/);
			if (match) {
				const [, key, value] = match;
				if (!key || !value) continue;
				// Convert values to appropriate types
				if (value === "true" || value === "false") {
					metadata[key] = value === "true";
				} else if (!Number.isNaN(Number(value))) {
					metadata[key] = Number(value);
				} else if (value === "null") {
					metadata[key] = null;
				} else {
					metadata[key] = value;
				}
			}
		}
		if (inSummaryTable && line.startsWith("## ") && line !== "## Summary") {
			inSummaryTable = false;
		}
	}

	// Extract sequences
	const sequences: Array<{ index: number; states: Array<{ id: string; title: string; status: string }> }> = [];
	interface SequenceType {
		index: number;
		states: Array<{ id: string; title: string; status: string }>;
	}
	let currentSequence: SequenceType | null = null;

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		if (!line) continue;

		// Match sequence headers like "### Sequence 1"
		const sequenceMatch = line.match(/^### Sequence (\d+)$/);
		if (sequenceMatch) {
			if (currentSequence) {
				sequences.push(currentSequence);
			}
			const indexStr = sequenceMatch[1];
			if (!indexStr) continue;
			currentSequence = {
				index: Number.parseInt(indexStr, 10),
				states: [],
			};
			continue;
		}

		// Match state lines like "- **state-1** - Foundation State (To Do)"
		if (currentSequence && line.match(/^- \*\*(.+?)\*\* - (.+?) \((.+?)\)$/)) {
			const stateMatch = line.match(/^- \*\*(.+?)\*\* - (.+?) \((.+?)\)$/);
			if (stateMatch) {
				const [, id, title, status] = stateMatch;
				if (id && title && status) {
					currentSequence.states.push({ id, title, status });
				}
			}
		}
	}

	if (currentSequence) {
		sequences.push(currentSequence);
	}

	// Extract unsequenced states
	const unsequenced: Array<{ id: string; title: string; status: string }> = [];
	let inUnsequenced = false;

	for (const line of lines) {
		if (line.trim() === "## Unsequenced States") {
			inUnsequenced = true;
			continue;
		}
		if (inUnsequenced && line.match(/^- \*\*(.+?)\*\* - (.+?) \((.+?)\)$/)) {
			const stateMatch = line.match(/^- \*\*(.+?)\*\* - (.+?) \((.+?)\)$/);
			if (stateMatch) {
				const [, id, title, status] = stateMatch;
				if (id && title && status) {
					unsequenced.push({ id, title, status });
				}
			}
		}
		if (inUnsequenced && line && line.startsWith("## ") && line !== "## Unsequenced States") {
			inUnsequenced = false;
		}
	}

	return {
		sequences,
		unsequenced,
		metadata: {
			totalStates: metadata["Total States"] || 0,
			filteredStates: metadata["Filtered States"] || 0,
			sequenceCount: metadata.Sequences || 0,
			unsequencedCount: metadata["Unsequenced States"] || 0,
			includeCompleted: metadata["Include Completed"] || false,
			filterStatus: metadata["Filter Status"] || null,
		},
	};
}

/**
 * Parse sequence plan markdown response into structured data
 */
export function parseSequencePlanMarkdown(markdown: string) {
	const lines = markdown.split("\n");

	// Extract summary metadata
	const summary: Record<string, string | number> = {};
	let inSummaryTable = false;

	for (const line of lines) {
		if (line.trim() === "## Summary") {
			inSummaryTable = true;
			continue;
		}
		if (inSummaryTable && line.startsWith("| ") && !line.includes("Metric")) {
			const match = line.match(/\|\s*(.+?)\s*\|\s*(.+?)\s*\|/);
			if (match) {
				const [, key, value] = match;
				if (!key || !value) continue;
				summary[key] = !Number.isNaN(Number(value)) ? Number(value) : value;
			}
		}
		if (inSummaryTable && line.startsWith("## ") && line !== "## Summary") {
			inSummaryTable = false;
		}
	}

	// Extract phases
	const phases: Array<{
		phase: number;
		name: string;
		states: Array<{ id: string; title: string; status: string; assignee?: string[]; dependencies?: string[] }>;
		dependsOn?: number[];
	}> = [];

	interface PhaseType {
		phase: number;
		name: string;
		states: Array<{ id: string; title: string; status: string; assignee?: string[]; dependencies?: string[] }>;
		dependsOn?: number[];
	}
	let currentPhase: PhaseType | null = null;
	let inPhaseStates = false;

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		if (!line) continue;

		// Match phase headers like "### Phase 1: Sequence 1"
		const phaseMatch = line.match(/^### Phase (\d+): (.+)$/);
		if (phaseMatch) {
			if (currentPhase) {
				phases.push(currentPhase);
			}
			const phaseNum = phaseMatch[1];
			const phaseName = phaseMatch[2];
			if (!phaseNum || !phaseName) continue;
			currentPhase = {
				phase: Number.parseInt(phaseNum, 10),
				name: phaseName,
				states: [],
				dependsOn: [],
			};
			inPhaseStates = false;
			continue;
		}

		// Match dependency lines like "**Depends on:** Phase 1"
		if (currentPhase && line.match(/^\*\*Depends on:\*\* (.+)$/)) {
			const dependsMatch = line.match(/^\*\*Depends on:\*\* Phase (.+)$/);
			if (dependsMatch?.[1]) {
				const deps = dependsMatch[1].split(", Phase ").map((n) => Number.parseInt(n, 10));
				currentPhase.dependsOn = deps;
			}
		}

		// Mark when we enter the states section
		if (currentPhase && line && line.trim() === "**States:**") {
			inPhaseStates = true;
			continue;
		}

		// Match state lines like "- **state-1** - Foundation State (To Do)"
		if (currentPhase && inPhaseStates && line && line.match(/^- \*\*(.+?)\*\* - (.+?) \((.+?)\)(.*)$/)) {
			const stateMatch = line.match(/^- \*\*(.+?)\*\* - (.+?) \((.+?)\)(.*)$/);
			if (stateMatch) {
				const [, id, title, status, extra] = stateMatch;
				if (!id || !title || !status) continue;
				const state: { id: string; title: string; status: string; assignee?: string[]; dependencies?: string[] } = {
					id,
					title,
					status,
				};

				// Parse assignee if present
				if (extra) {
					const assigneeMatch = extra.match(/\((.+?)\)/);
					if (assigneeMatch?.[1]) {
						state.assignee = assigneeMatch[1].split(", ");
					}
				}

				currentPhase.states.push(state);
			}
		}

		// Check for dependency lines
		if (currentPhase && inPhaseStates && line && line.match(/^\s+- Dependencies: (.+)$/)) {
			const depMatch = line.match(/^\s+- Dependencies: (.+)$/);
			if (depMatch?.[1] && currentPhase.states.length > 0) {
				const lastState = currentPhase.states[currentPhase.states.length - 1];
				if (lastState) {
					lastState.dependencies = depMatch[1].split(", ");
				}
			}
		}
	}

	if (currentPhase) {
		phases.push(currentPhase);
	}

	// Extract unsequenced states
	const unsequenced: Array<{ id: string; title: string; status: string; reason: string }> = [];
	let inUnsequenced = false;

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		if (!line) continue;

		if (line.trim() === "## Unsequenced States") {
			inUnsequenced = true;
			continue;
		}
		if (inUnsequenced && line.match(/^- \*\*(.+?)\*\* - (.+?) \((.+?)\)$/)) {
			const stateMatch = line.match(/^- \*\*(.+?)\*\* - (.+?) \((.+?)\)$/);
			if (stateMatch) {
				const [, id, title, status] = stateMatch;
				if (!id || !title || !status) continue;
				const nextLine = lines[i + 1];
				let reason = "";
				if (nextLine?.match(/^\s+- (.+)$/)) {
					const reasonMatch = nextLine.match(/^\s+- (.+)$/);
					if (reasonMatch?.[1]) {
						reason = reasonMatch[1];
					}
				}
				unsequenced.push({ id, title, status, reason });
			}
		}
		if (inUnsequenced && line && line.startsWith("## ") && line !== "## Unsequenced States") {
			inUnsequenced = false;
		}
	}

	return {
		phases,
		unsequenced,
		summary: {
			totalPhases: summary["Total Phases"] || 0,
			totalStatesInPlan: summary["States in Plan"] || 0,
			unsequencedStates: summary["Unsequenced States"] || 0,
			canStartImmediately: summary["Can Start Immediately"] || 0,
		},
	};
}

/**
 * Parse project overview markdown response into structured data
 */
export function parseProjectOverviewMarkdown(markdown: string) {
	const lines = markdown.split("\n");

	// Extract statistics from Project Statistics table
	const statistics: Record<string, string | number> = {};
	let inProjectStats = false;

	// Extract status counts from Status Breakdown table
	const statusCounts: Record<string, number> = {};
	let inStatusBreakdown = false;

	// Extract priority counts from Priority Breakdown table
	const priorityCounts: Record<string, number> = {};
	let inPriorityBreakdown = false;

	// Extract recent activity and project health data
	const recentActivity = { created: [], updated: [] };
	const projectHealth = { averageStateAge: 0, staleStates: [], blockedStates: [] };

	for (const line of lines) {
		// Project Statistics section
		if (line.trim() === "## Project Statistics") {
			inProjectStats = true;
			inStatusBreakdown = false;
			inPriorityBreakdown = false;
			continue;
		}

		// Status Breakdown section
		if (line.trim() === "## Status Breakdown") {
			inProjectStats = false;
			inStatusBreakdown = true;
			inPriorityBreakdown = false;
			continue;
		}

		// Priority Breakdown section
		if (line.trim() === "## Priority Breakdown") {
			inProjectStats = false;
			inStatusBreakdown = false;
			inPriorityBreakdown = true;
			continue;
		}

		// Reset flags on other sections
		if (
			line.startsWith("## ") &&
			!["## Project Statistics", "## Status Breakdown", "## Priority Breakdown"].includes(line.trim())
		) {
			inProjectStats = false;
			inStatusBreakdown = false;
			inPriorityBreakdown = false;
		}

		// Parse table rows
		if (
			line.startsWith("| ") &&
			!line.includes("Metric") &&
			!line.includes("Status") &&
			!line.includes("Priority") &&
			!line.includes("-----")
		) {
			const match = line.match(/\|\s*(.+?)\s*\|\s*(.+?)\s*\|/);
			if (match) {
				const [, key, value] = match;
				if (!key || !value) continue;

				if (inProjectStats) {
					// Convert values to appropriate types for project statistics
					if (key === "Completion Rate") {
						statistics[key] = Number.parseInt(value.replace("%", ""), 10);
					} else if (!Number.isNaN(Number(value))) {
						statistics[key] = Number(value);
					} else {
						statistics[key] = value;
					}
				} else if (inStatusBreakdown) {
					statusCounts[key] = Number.parseInt(value, 10) || 0;
				} else if (inPriorityBreakdown) {
					priorityCounts[key] = Number.parseInt(value, 10) || 0;
				}
			}
		}
	}

	return {
		success: true,
		statistics: {
			statusCounts,
			priorityCounts,
			totalStates: statistics["Total States"] || 0,
			completedStates: statistics["Completed States"] || 0,
			completionPercentage: statistics["Completion Rate"] || 0,
			draftCount: statistics["Draft States"] || 0,
			recentActivity,
			projectHealth,
		},
	};
}

/**
 * Parse config markdown response into structured data
 */
export function parseConfigMarkdown(markdown: string): unknown {
	const lines = markdown.split("\n");

	// Check if this is a single config value
	let configKey: string | null = null;
	let inJsonBlock = false;
	const jsonContent: string[] = [];

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i]?.trim();
		if (!line) continue;

		// Match config key like "**projectName:**"
		const keyMatch = line.match(/^\*\*(.+?):\*\*$/);
		if (keyMatch?.[1]) {
			configKey = keyMatch[1];
			continue;
		}

		// Check for JSON code block
		if (line === "```json") {
			inJsonBlock = true;
			continue;
		}

		if (line === "```") {
			inJsonBlock = false;
			// Parse the JSON content
			const jsonStr = jsonContent.join("\n");
			try {
				return JSON.parse(jsonStr);
			} catch {
				return jsonStr;
			}
		}

		if (inJsonBlock) {
			const rawLine = lines[i];
			if (rawLine !== undefined) {
				jsonContent.push(rawLine); // Don't trim - preserve formatting
			}
			continue;
		}

		// Match single value like "`Test Project`"
		const valueMatch = line.match(/^`(.+)`$/);
		if (valueMatch && configKey) {
			const value = valueMatch[1];
			// Handle special values
			if (value === "null") return null;
			if (value === "true") return true;
			if (value === "false") return false;
			if (!Number.isNaN(Number(value)) && value !== "") return Number(value);
			return value;
		}
	}

	// If no specific pattern found, try to parse as full config object
	// Look for the config table format: | Setting | Value |
	const config: Record<string, unknown> = {};

	for (const line of lines) {
		// Match table rows: | projectName | `Test Project` |
		const tableMatch = line.match(/^\|\s*([^|]+?)\s*\|\s*`([^`]+?)`\s*\|$/);
		if (tableMatch) {
			const [, key, value] = tableMatch;
			if (!key || !value) continue;
			const cleanKey = key.trim();
			let parsedValue: unknown = value;

			// Parse array format: [To Do, In Progress, Done]
			if (value.startsWith("[") && value.endsWith("]")) {
				const arrayContent = value.slice(1, -1).trim();
				if (arrayContent) {
					parsedValue = arrayContent.split(",").map((v) => v.trim());
				} else {
					parsedValue = [];
				}
			} else if (value === "null") {
				parsedValue = null;
			} else if (value === "true") {
				parsedValue = true;
			} else if (value === "false") {
				parsedValue = false;
			} else if (!Number.isNaN(Number(value)) && value !== "") {
				parsedValue = Number(value);
			}

			config[cleanKey] = parsedValue;
		}

		// Also handle the key-value format for single configs
		const keyMatch = line.match(/^\*\*(.+?):\*\*$/);
		if (keyMatch && keyMatch[1] !== undefined) {
			const key = keyMatch[1];
			// Look for the value in the next non-empty line
			const nextLineIndex = lines.findIndex((l, i) => i > lines.indexOf(line) && l.trim().length > 0);
			if (nextLineIndex !== -1) {
				const valueLine = lines[nextLineIndex];
				if (valueLine) {
					const valueMatch = valueLine.match(/^`(.+)`$/);
					if (valueMatch && valueMatch[1] !== undefined) {
						const value = valueMatch[1];
						if (value === "null") config[key] = null;
						else if (value === "true") config[key] = true;
						else if (value === "false") config[key] = false;
						else if (!Number.isNaN(Number(value)) && value !== "") config[key] = Number(value);
						else config[key] = value;
					}
				}
			}
		}
	}

	return Object.keys(config).length > 0 ? config : markdown;
}
