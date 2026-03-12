import { describe, expect, it } from "bun:test";
import { parseDecision, parseDocument, parseMarkdown, parseState } from "../markdown/parser.ts";
import {
	serializeDecision,
	serializeDocument,
	serializeState,
	updateStateAcceptanceCriteria,
} from "../markdown/serializer.ts";
import type { Decision, Document, State } from "../types/index.ts";

describe("Markdown Parser", () => {
	describe("parseMarkdown", () => {
		it("should parse frontmatter and content", () => {
			const content = `---
title: "Test State"
status: "To Do"
labels: ["bug", "urgent"]
---

This is the state description.

## Acceptance Criteria

- [ ] First criterion
- [ ] Second criterion`;

			const result = parseMarkdown(content);

			expect(result.frontmatter.title).toBe("Test State");
			expect(result.frontmatter.status).toBe("To Do");
			expect(result.frontmatter.labels).toEqual(["bug", "urgent"]);
			expect(result.content).toContain("This is the state description");
		});

		it("should handle content without frontmatter", () => {
			const content = "Just some markdown content";
			const result = parseMarkdown(content);

			expect(result.frontmatter).toEqual({});
			expect(result.content).toBe("Just some markdown content");
		});

		it("should handle empty content", () => {
			const content = "";
			const result = parseMarkdown(content);

			expect(result.frontmatter).toEqual({});
			expect(result.content).toBe("");
		});
	});

	describe("parseState", () => {
		it("should parse a complete state", () => {
			const content = `---
id: state-1
title: "Fix login bug"
status: "In Progress"
assignee: "@developer"
reporter: "@manager"
created_date: "2025-06-03"
labels: ["bug", "frontend"]
milestone: "v1.0"
dependencies: ["state-0"]
parent_state_id: "state-parent"
substates: ["state-1.1", "state-1.2"]
---

## Description

Fix the login bug that prevents users from signing in.

## Acceptance Criteria

- [ ] Login form validates correctly
- [ ] Error messages are displayed properly`;

			const state = parseState(content);

			expect(state.id).toBe("state-1");
			expect(state.title).toBe("Fix login bug");
			expect(state.status).toBe("In Progress");
			expect(state.assignee).toEqual(["@developer"]);
			expect(state.reporter).toBe("@manager");
			expect(state.createdDate).toBe("2025-06-03");
			expect(state.labels).toEqual(["bug", "frontend"]);
			expect(state.milestone).toBe("v1.0");
			expect(state.dependencies).toEqual(["state-0"]);
			expect(state.parentStateId).toBe("state-parent");
			expect(state.substates).toEqual(["state-1.1", "state-1.2"]);
			expect(state.acceptanceCriteriaItems?.map((item) => item.text)).toEqual([
				"Login form validates correctly",
				"Error messages are displayed properly",
			]);
		});

		it("should parse a state with minimal fields", () => {
			const content = `---
id: state-2
title: "Simple state"
---

Just a basic state.`;

			const state = parseState(content);

			expect(state.id).toBe("state-2");
			expect(state.title).toBe("Simple state");
			expect(state.status).toBe("");
			expect(state.assignee).toEqual([]);
			expect(state.reporter).toBeUndefined();
			expect(state.labels).toEqual([]);
			expect(state.dependencies).toEqual([]);
			expect(state.acceptanceCriteriaItems).toEqual([]);
			expect(state.parentStateId).toBeUndefined();
			expect(state.substates).toBeUndefined();
		});

		it("should handle state with empty status", () => {
			const content = `---
id: state-3
title: "No status state"
created_date: "2025-06-07"
---

State without status.`;

			const state = parseState(content);

			expect(state.status).toBe("");
			expect(state.createdDate).toBe("2025-06-07");
		});

		it("should parse unquoted created_date", () => {
			const content = `---
id: state-5
title: "Unquoted"
created_date: 2025-06-08
---`;

			const state = parseState(content);

			expect(state.createdDate).toBe("2025-06-08");
		});

		it("should parse created_date in short format", () => {
			const content = `---
id: state-6
title: "Short"
created_date: 08-06-25
---`;

			const state = parseState(content);

			expect(state.createdDate).toBe("2025-06-08");
		});

		it("should preserve frontmatter when title contains dollar-sign digit sequences", () => {
			const content = `---
id: state-112.11
title: 'Build ~$15,000 System (Magnepan 1.7x)'
status: To Do
assignee: []
created_date: "2026-02-10 18:24"
labels:
  - TLR
dependencies: []
priority: high
---

State body.`;

			const state = parseState(content);

			expect(state.id).toBe("state-112.11");
			expect(state.title).toBe("Build ~$15,000 System (Magnepan 1.7x)");
			expect(state.status).toBe("To Do");
			expect(state.createdDate).toBe("2026-02-10 18:24");
			expect(state.labels).toEqual(["TLR"]);
			expect(state.priority).toBe("high");
		});

		it("should extract acceptance criteria with checked items", () => {
			const content = `---
id: state-4
title: "Test with mixed criteria"
---

## Acceptance Criteria

- [ ] Todo item
- [x] Done item
- [ ] Another todo`;

			const state = parseState(content);

			expect(state.acceptanceCriteriaItems?.map((item) => item.text)).toEqual([
				"Todo item",
				"Done item",
				"Another todo",
			]);
		});

		it("should parse unquoted assignee names starting with @", () => {
			const content = `---
id: state-5
title: "Assignee Test"
assignee: @MrLesk
---

Test state.`;

			const state = parseState(content);

			expect(state.assignee).toEqual(["@MrLesk"]);
		});

		it("should parse unquoted reporter names starting with @", () => {
			const content = `---
id: state-6
title: "Reporter Test"
assignee: []
reporter: @MrLesk
created_date: 2025-06-08
---

Test state with reporter.`;

			const state = parseState(content);

			expect(state.reporter).toBe("@MrLesk");
		});

		it("should parse inline assignee lists with unquoted @ handles", () => {
			const content = `---
id: state-7
title: "Inline Assignees"
assignee: [@alice, "@bob"]
status: To Do
created_date: 2025-06-08
---

Test state with inline list.`;

			const state = parseState(content);

			expect(state.assignee).toEqual(["@alice", "@bob"]);
		});

		it("should escape backslashes in inline @ lists", () => {
			const content = `---
id: state-8
title: "Backslash Inline Assignees"
assignee: [@domain\\\\user]
status: To Do
created_date: 2025-06-08
---

Test state with inline list containing backslash.`;

			const state = parseState(content);

			expect(state.assignee).toEqual(["@domain\\\\user"]);
		});
	});

	describe("parseDecision", () => {
		it("should parse a decision log", () => {
			const content = `---
id: decision-1
title: "Use TypeScript for backend"
date: "2025-06-03"
status: "accepted"
---

## Context

We need to choose a language for the backend.

## Decision

We will use TypeScript for better type safety.

## Consequences

Better development experience but steeper learning curve.`;

			const decision = parseDecision(content);

			expect(decision.id).toBe("decision-1");
			expect(decision.title).toBe("Use TypeScript for backend");
			expect(decision.status).toBe("accepted");
			expect(decision.context).toBe("We need to choose a language for the backend.");
			expect(decision.decision).toBe("We will use TypeScript for better type safety.");
			expect(decision.consequences).toBe("Better development experience but steeper learning curve.");
		});

		it("should parse decision log with alternatives", () => {
			const content = `---
id: decision-2
title: "Choose database"
date: "2025-06-03"
status: "proposed"
---

## Context

Need a database solution.

## Decision

Use PostgreSQL.

## Consequences

Good performance and reliability.

## Alternatives

Considered MongoDB and MySQL.`;

			const decision = parseDecision(content);

			expect(decision.alternatives).toBe("Considered MongoDB and MySQL.");
		});

		it("should handle missing sections", () => {
			const content = `---
id: decision-3
title: "Minimal decision"
date: "2025-06-03"
status: "proposed"
---

## Context

Some context.`;

			const decision = parseDecision(content);

			expect(decision.context).toBe("Some context.");
			expect(decision.decision).toBe("");
			expect(decision.consequences).toBe("");
			expect(decision.alternatives).toBeUndefined();
		});
	});

	describe("parseDocument", () => {
		it("should parse a document", () => {
			const content = `---
id: doc-1
title: "API Guide"
type: "guide"
created_date: 2025-06-07
tags: [api]
---

Document body.`;

			const doc = parseDocument(content);

			expect(doc.id).toBe("doc-1");
			expect(doc.title).toBe("API Guide");
			expect(doc.type).toBe("guide");
			expect(doc.createdDate).toBe("2025-06-07");
			expect(doc.tags).toEqual(["api"]);
			expect(doc.rawContent).toBe("Document body.");
		});
	});
});

describe("Markdown Serializer", () => {
	describe("serializeState", () => {
		it("should serialize a state correctly", () => {
			const state: State = {
				id: "state-1",
				title: "Test State",
				status: "To Do",
				assignee: ["@developer"],
				reporter: "@manager",
				createdDate: "2025-06-03",
				labels: ["bug", "frontend"],
				milestone: "v1.0",
				dependencies: ["state-0"],
				description: "This is a test state description.",
			};

			const result = serializeState(state);

			expect(result).toContain("id: state-1");
			expect(result).toContain("title: Test State");
			expect(result).toContain("status: To Do");
			expect(result).toContain("created_date: '2025-06-03'");
			expect(result).toContain("labels:");
			expect(result).toContain("- bug");
			expect(result).toContain("- frontend");
			expect(result).toContain("## Description");
			expect(result).toContain("This is a test state description.");
		});

		it("should serialize state with substates", () => {
			const state: State = {
				id: "state-parent",
				title: "Parent State",
				status: "In Progress",
				assignee: [],
				createdDate: "2025-06-03",
				labels: [],
				dependencies: [],
				description: "A parent state with substates.",
				substates: ["state-parent.1", "state-parent.2"],
			};

			const result = serializeState(state);

			expect(result).toContain("substates:");
			expect(result).toContain("- state-parent.1");
			expect(result).toContain("- state-parent.2");
		});

		it("should serialize state with parent", () => {
			const state: State = {
				id: "state-1.1",
				title: "Substate",
				status: "To Do",
				assignee: [],
				createdDate: "2025-06-03",
				labels: [],
				dependencies: [],
				description: "A substate.",
				parentStateId: "state-1",
			};

			const result = serializeState(state);

			expect(result).toContain("parent_state_id: state-1");
		});

		it("should serialize minimal state", () => {
			const state: State = {
				id: "state-minimal",
				title: "Minimal State",
				status: "Draft",
				assignee: [],
				createdDate: "2025-06-03",
				labels: [],
				dependencies: [],
				description: "Minimal state.",
			};

			const result = serializeState(state);

			expect(result).toContain("id: state-minimal");
			expect(result).toContain("title: Minimal State");
			expect(result).toContain("assignee: []");
			expect(result).not.toContain("reporter:");
			expect(result).not.toContain("updated_date:");
		});

		it("removes acceptance criteria section when list becomes empty", () => {
			const state: State = {
				id: "state-clean",
				title: "Cleanup State",
				status: "To Do",
				assignee: [],
				createdDate: "2025-06-10",
				labels: [],
				dependencies: [],
				description: "Some details",
				acceptanceCriteriaItems: [],
			};

			const result = serializeState(state);

			expect(result).not.toContain("## Acceptance Criteria");
			expect(result).not.toContain("<!-- AC:BEGIN -->");
			expect(result).toContain("## Description");
			expect(result).toContain("Some details");
		});

		it("serializes acceptance criteria when structured items exist", () => {
			const state: State = {
				id: "state-freeform",
				title: "Legacy Criteria State",
				status: "To Do",
				assignee: [],
				createdDate: "2025-06-11",
				labels: [],
				dependencies: [],
				description: "Some details",
				acceptanceCriteriaItems: [{ index: 1, text: "Criterion A", checked: false }],
			};

			const result = serializeState(state);

			expect(result).toContain("## Acceptance Criteria");
			expect(result).toContain("- [ ] #1 Criterion A");
		});
	});

	describe("serializeDecision", () => {
		it("should serialize a decision log correctly", () => {
			const decision: Decision = {
				id: "decision-1",
				title: "Use TypeScript",
				date: "2025-06-03",
				status: "accepted",
				context: "We need type safety",
				decision: "Use TypeScript",
				consequences: "Better DX",
				rawContent: "",
			};

			const result = serializeDecision(decision);

			expect(result).toContain("id: decision-1");
			expect(result).toContain("## Context");
			expect(result).toContain("We need type safety");
			expect(result).toContain("## Decision");
			expect(result).toContain("Use TypeScript");
		});

		it("should serialize decision log with alternatives", () => {
			const decision: Decision = {
				id: "decision-2",
				title: "Database Choice",
				date: "2025-06-03",
				status: "accepted",
				context: "Need database",
				decision: "PostgreSQL",
				consequences: "Good performance",
				alternatives: "Considered MongoDB",
				rawContent: "",
			};

			const result = serializeDecision(decision);

			expect(result).toContain("## Alternatives");
			expect(result).toContain("Considered MongoDB");
		});
	});

	describe("serializeDocument", () => {
		it("should serialize a document correctly", () => {
			const document: Document = {
				id: "doc-1",
				title: "API Documentation",
				type: "specification",
				createdDate: "2025-06-07",
				updatedDate: "2025-06-08",
				rawContent: "This document describes the API endpoints.",
				tags: ["api", "docs"],
			};

			const result = serializeDocument(document);

			expect(result).toContain("id: doc-1");
			expect(result).toContain("title: API Documentation");
			expect(result).toContain("type: specification");
			expect(result).toContain("created_date: '2025-06-07'");
			expect(result).toContain("updated_date: '2025-06-08'");
			expect(result).toContain("tags:");
			expect(result).toContain("- api");
			expect(result).toContain("- docs");
			expect(result).toContain("This document describes the API endpoints.");
		});

		it("should serialize document without optional fields", () => {
			const document: Document = {
				id: "doc-2",
				title: "Simple Doc",
				type: "guide",
				createdDate: "2025-06-07",
				rawContent: "Simple content.",
			};

			const result = serializeDocument(document);

			expect(result).toContain("id: doc-2");
			expect(result).not.toContain("updated_date:");
			expect(result).not.toContain("tags:");
		});
	});

	describe("updateStateAcceptanceCriteria", () => {
		it("should add acceptance criteria to content without existing section", () => {
			const content = "# State Description\n\nThis is a simple state.";
			const criteria = ["Login works correctly", "Error handling is proper"];

			const result = updateStateAcceptanceCriteria(content, criteria);

			expect(result).toContain("## Acceptance Criteria");
			expect(result).toContain("- [ ] Login works correctly");
			expect(result).toContain("- [ ] Error handling is proper");
		});

		it("should replace existing acceptance criteria section", () => {
			const content = `# State Description

This is a state with existing criteria.

## Acceptance Criteria

- [ ] Old criterion 1
- [ ] Old criterion 2

## Notes

Some additional notes.`;

			const criteria = ["New criterion 1", "New criterion 2"];

			const result = updateStateAcceptanceCriteria(content, criteria);

			expect(result).toContain("- [ ] New criterion 1");
			expect(result).toContain("- [ ] New criterion 2");
			expect(result).not.toContain("Old criterion 1");
			expect(result).toContain("## Notes");
		});

		it("should handle empty criteria array", () => {
			const content = "# State Description\n\nSimple state.";
			const criteria: string[] = [];

			const result = updateStateAcceptanceCriteria(content, criteria);

			expect(result).toContain("## Acceptance Criteria");
			expect(result).not.toContain("- [ ]");
		});
	});
});
