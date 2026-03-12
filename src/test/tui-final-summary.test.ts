import { describe, expect, it } from "bun:test";
import type { State } from "../types/index.ts";
import { createStatePopup } from "../ui/state-viewer-with-search.ts";
import { createScreen } from "../ui/tui.ts";

describe("TUI Final Summary display", () => {
	it("shows Final Summary section when present", async () => {
		const screen = createScreen({ smartCSR: false });
		const originalIsTTY = process.stdout.isTTY;
		let patchedTTY = false;

		try {
			if (process.stdout.isTTY === false) {
				Object.defineProperty(process.stdout, "isTTY", { value: true, configurable: true });
				patchedTTY = true;
			}

			const state: State = {
				id: "STATE-1",
				title: "Summarized state",
				status: "To Do",
				assignee: [],
				createdDate: "2025-01-01",
				labels: [],
				dependencies: [],
				finalSummary: "PR-style summary",
			};

			const popup = await createStatePopup(screen, state);
			expect(popup).not.toBeNull();

			const contentArea = popup?.contentArea as
				| {
						getContent?: () => string;
						content?: string;
				  }
				| undefined;
			const content = contentArea?.getContent ? contentArea.getContent() : (contentArea?.content ?? "");
			const contentText = String(content);
			expect(contentText).toContain("Final Summary");
			expect(contentText).toContain("PR-style summary");

			popup?.close();
		} finally {
			if (patchedTTY) {
				Object.defineProperty(process.stdout, "isTTY", { value: originalIsTTY, configurable: true });
			}
			screen.destroy();
		}
	});

	it("hides Final Summary section when empty", async () => {
		const screen = createScreen({ smartCSR: false });
		const originalIsTTY = process.stdout.isTTY;
		let patchedTTY = false;

		try {
			if (process.stdout.isTTY === false) {
				Object.defineProperty(process.stdout, "isTTY", { value: true, configurable: true });
				patchedTTY = true;
			}

			const state: State = {
				id: "STATE-2",
				title: "No summary state",
				status: "To Do",
				assignee: [],
				createdDate: "2025-01-01",
				labels: [],
				dependencies: [],
			};

			const popup = await createStatePopup(screen, state);
			expect(popup).not.toBeNull();

			const contentArea = popup?.contentArea as
				| {
						getContent?: () => string;
						content?: string;
				  }
				| undefined;
			const content = contentArea?.getContent ? contentArea.getContent() : (contentArea?.content ?? "");
			const contentText = String(content);
			expect(contentText).not.toContain("Final Summary");

			popup?.close();
		} finally {
			if (patchedTTY) {
				Object.defineProperty(process.stdout, "isTTY", { value: originalIsTTY, configurable: true });
			}
			screen.destroy();
		}
	});
});
