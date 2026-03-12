import { describe, expect, it } from "bun:test";
import type { State } from "../types/index.ts";
import { createStatePopup } from "../ui/state-viewer-with-search.ts";
import { createScreen } from "../ui/tui.ts";

describe("TUI documentation display", () => {
	it("shows documentation entries in state popup content", async () => {
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
				title: "Documented state",
				status: "To Do",
				assignee: [],
				createdDate: "2025-01-01",
				labels: [],
				dependencies: [],
				documentation: ["README.md", "https://docs.example.com"],
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
			expect(contentText).toContain("Documentation");
			expect(contentText).toContain("README.md");
			expect(contentText).toContain("https://docs.example.com");

			popup?.close();
		} finally {
			if (patchedTTY) {
				Object.defineProperty(process.stdout, "isTTY", { value: originalIsTTY, configurable: true });
			}
			screen.destroy();
		}
	});
});
