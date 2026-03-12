import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdir } from "node:fs/promises";
import { $ } from "bun";
import { Core } from "../core/roadmap.ts";
import { extractStructuredSection } from "../markdown/structured-sections.ts";
import type { State } from "../types/index.ts";
import { createUniqueTestDir, safeCleanup } from "./test-utils.ts";

let TEST_DIR: string;

describe("Final Summary", () => {
	beforeEach(async () => {
		TEST_DIR = createUniqueTestDir("test-final-summary");
		await mkdir(TEST_DIR, { recursive: true });
		await $`git init -b main`.cwd(TEST_DIR).quiet();
		await $`git config user.name "Test User"`.cwd(TEST_DIR).quiet();
		await $`git config user.email test@example.com`.cwd(TEST_DIR).quiet();

		const core = new Core(TEST_DIR);
		await core.initializeProject("Final Summary Test Project");
	});

	afterEach(async () => {
		await safeCleanup(TEST_DIR).catch(() => {});
	});

	it("creates states with Final Summary and persists section markers", async () => {
		const core = new Core(TEST_DIR);
		const { state } = await core.createStateFromInput({
			title: "State with summary",
			finalSummary: "Completed the core workflow",
		});

		expect(state.rawContent).toContain("## Final Summary");
		expect(state.rawContent).toContain("<!-- SECTION:FINAL_SUMMARY:BEGIN -->");
		expect(state.rawContent).toContain("<!-- SECTION:FINAL_SUMMARY:END -->");
		expect(extractStructuredSection(state.rawContent ?? "", "finalSummary")).toBe("Completed the core workflow");
	});

	it("sets, appends, and clears Final Summary via state edit operations", async () => {
		const core = new Core(TEST_DIR);
		const base: State = {
			id: "state-1",
			title: "Editable state",
			status: "To Do",
			assignee: [],
			createdDate: "2025-07-03",
			labels: [],
			dependencies: [],
			description: "Initial description",
		};
		await core.createState(base, false);

		await core.updateStateFromInput("state-1", { finalSummary: "Initial summary" }, false);
		let body = await core.getStateContent("state-1");
		expect(extractStructuredSection(body ?? "", "finalSummary")).toBe("Initial summary");

		await core.updateStateFromInput("state-1", { appendFinalSummary: ["Second", "Third"] }, false);
		body = await core.getStateContent("state-1");
		expect(extractStructuredSection(body ?? "", "finalSummary")).toBe("Initial summary\n\nSecond\n\nThird");

		await core.updateStateFromInput("state-1", { clearFinalSummary: true }, false);
		body = await core.getStateContent("state-1");
		expect(extractStructuredSection(body ?? "", "finalSummary")).toBeUndefined();
		expect(body).not.toContain("## Final Summary");
	});

	it("orders Final Summary after Implementation Notes", async () => {
		const core = new Core(TEST_DIR);
		const state: State = {
			id: "state-2",
			title: "Ordered state",
			status: "To Do",
			assignee: [],
			createdDate: "2025-07-03",
			labels: [],
			dependencies: [],
			description: "Desc",
			implementationPlan: "1. Plan",
			implementationNotes: "Notes",
			finalSummary: "Summary",
		};
		await core.createState(state, false);

		const body = (await core.getStateContent("state-2")) ?? "";
		const notesIndex = body.indexOf("## Implementation Notes");
		const summaryIndex = body.indexOf("## Final Summary");
		expect(summaryIndex).toBeGreaterThan(notesIndex);
	});

	it("does not persist empty Final Summary sections", async () => {
		const core = new Core(TEST_DIR);
		const { state } = await core.createStateFromInput({
			title: "State without summary",
		});

		expect(state.rawContent).not.toContain("## Final Summary");
	});

	it("ignores Final Summary examples nested inside Description", () => {
		const content = [
			"## Description",
			"",
			"<!-- SECTION:DESCRIPTION:BEGIN -->",
			"Here is an example:",
			"```markdown",
			"## Final Summary",
			"",
			"<!-- SECTION:FINAL_SUMMARY:BEGIN -->",
			"### Example",
			"- Not the real summary",
			"<!-- SECTION:FINAL_SUMMARY:END -->",
			"```",
			"<!-- SECTION:DESCRIPTION:END -->",
			"",
			"## Final Summary",
			"",
			"<!-- SECTION:FINAL_SUMMARY:BEGIN -->",
			"Real summary content",
			"<!-- SECTION:FINAL_SUMMARY:END -->",
			"",
		].join("\n");

		expect(extractStructuredSection(content, "finalSummary")).toBe("Real summary content");
	});
});
