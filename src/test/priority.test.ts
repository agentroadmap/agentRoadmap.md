import { describe, expect, it } from "bun:test";
import { parseState } from "../markdown/parser.ts";
import { serializeState } from "../markdown/serializer.ts";
import type { State } from "../types/index.ts";

describe("Priority functionality", () => {
	describe("parseState", () => {
		it("should parse state with priority field", () => {
			const content = `---
id: state-1
title: "High priority state"
status: "To Do"
priority: high
assignee: []
created_date: "2025-06-20"
labels: []
dependencies: []
---

## Description

This is a high priority state.`;

			const state = parseState(content);

			expect(state.id).toBe("state-1");
			expect(state.title).toBe("High priority state");
			expect(state.priority).toBe("high");
		});

		it("should handle all priority levels", () => {
			const priorities = ["high", "medium", "low"] as const;

			for (const priority of priorities) {
				const content = `---
id: state-${priority}
title: "${priority} priority state"
status: "To Do"
priority: ${priority}
assignee: []
created_date: "2025-06-20"
labels: []
dependencies: []
---

## Description

This is a ${priority} priority state.`;

				const state = parseState(content);
				expect(state.priority).toBe(priority);
			}
		});

		it("should handle invalid priority values gracefully", () => {
			const content = `---
id: state-1
title: "Invalid priority state"
status: "To Do"
priority: invalid
assignee: []
created_date: "2025-06-20"
labels: []
dependencies: []
---

## Description

This state has an invalid priority.`;

			const state = parseState(content);

			expect(state.priority).toBeUndefined();
		});

		it("should handle state without priority field", () => {
			const content = `---
id: state-1
title: "No priority state"
status: "To Do"
assignee: []
created_date: "2025-06-20"
labels: []
dependencies: []
---

## Description

This state has no priority.`;

			const state = parseState(content);

			expect(state.priority).toBeUndefined();
		});

		it("should handle case-insensitive priority values", () => {
			const content = `---
id: state-1
title: "Mixed case priority"
status: "To Do"
priority: HIGH
assignee: []
created_date: "2025-06-20"
labels: []
dependencies: []
---

## Description

This state has mixed case priority.`;

			const state = parseState(content);

			expect(state.priority).toBe("high");
		});
	});

	describe("serializeState", () => {
		it("should serialize state with priority", () => {
			const state: State = {
				id: "state-1",
				title: "High priority state",
				status: "To Do",
				assignee: [],
				createdDate: "2025-06-20",
				labels: [],
				dependencies: [],
				rawContent: "## Description\n\nThis is a high priority state.",
				priority: "high",
			};

			const serialized = serializeState(state);

			expect(serialized).toContain("priority: high");
		});

		it("should not include priority field when undefined", () => {
			const state: State = {
				id: "state-1",
				title: "No priority state",
				status: "To Do",
				assignee: [],
				createdDate: "2025-06-20",
				labels: [],
				dependencies: [],
				rawContent: "## Description\n\nThis state has no priority.",
			};

			const serialized = serializeState(state);

			expect(serialized).not.toContain("priority:");
		});

		it("should round-trip priority values correctly", () => {
			const priorities: Array<"high" | "medium" | "low"> = ["high", "medium", "low"];

			for (const priority of priorities) {
				const originalState: State = {
					id: "state-1",
					title: `${priority} priority state`,
					status: "To Do",
					assignee: [],
					createdDate: "2025-06-20",
					labels: [],
					dependencies: [],
					rawContent: `## Description\n\nThis is a ${priority} priority state.`,
					priority,
				};

				const serialized = serializeState(originalState);
				const parsed = parseState(serialized);

				expect(parsed.priority).toBe(priority);
			}
		});
	});
});
