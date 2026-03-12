import { describe, expect, it } from "bun:test";
import { JSDOM } from "jsdom";
import React from "react";
import { renderToString } from "react-dom/server";
import type { State } from "../types/index.ts";
import { ThemeProvider } from "../web/contexts/ThemeContext";
import { StateDetailsModal } from "../web/components/StateDetailsModal";

const setupDom = () => {
	const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost" });
	globalThis.window = dom.window as unknown as Window & typeof globalThis;
	globalThis.document = dom.window.document as Document;
	globalThis.navigator = dom.window.navigator as Navigator;
	globalThis.localStorage = dom.window.localStorage;

	if (!window.matchMedia) {
		window.matchMedia = () =>
			({
				matches: false,
				media: "",
				onchange: null,
				addListener: () => {},
				removeListener: () => {},
				addEventListener: () => {},
				removeEventListener: () => {},
				dispatchEvent: () => false,
			}) as MediaQueryList;
	}
};

describe("Web state popup documentation display", () => {
	it("renders documentation entries when present", () => {
		setupDom();

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

		const html = renderToString(
			<ThemeProvider>
				<StateDetailsModal state={state} isOpen={true} onClose={() => {}} />
			</ThemeProvider>,
		);

		expect(html).toContain("Documentation");
		expect(html).toContain("README.md");
		expect(html).toContain("https://docs.example.com");
	});

	it("hides documentation section when empty", () => {
		setupDom();

		const state: State = {
			id: "STATE-2",
			title: "No docs state",
			status: "To Do",
			assignee: [],
			createdDate: "2025-01-01",
			labels: [],
			dependencies: [],
			documentation: [],
		};

		const html = renderToString(
			<ThemeProvider>
				<StateDetailsModal state={state} isOpen={true} onClose={() => {}} />
			</ThemeProvider>,
		);

		expect(html).not.toContain("Documentation");
	});
});
