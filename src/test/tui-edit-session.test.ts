import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Core } from "../core/roadmap.ts";
import type { RoadmapConfig, State } from "../types/index.ts";
import { createUniqueTestDir, safeCleanup } from "./test-utils.ts";

function createMockScreen(): Parameters<Core["editStateInTui"]>[1] {
	return {
		program: {
			disableMouse: () => {},
			enableMouse: () => {},
			hideCursor: () => {},
			showCursor: () => {},
			input: process.stdin,
			pause: () => () => {},
			flush: () => {},
			put: {
				keypad_local: () => {},
				keypad_xmit: () => {},
			},
		},
		leave: () => {},
		enter: () => {},
		render: () => {},
		clearRegion: () => {},
		width: 120,
		height: 40,
		emit: () => {},
	};
}

describe("Core.editStateInTui", () => {
	let testDir: string;
	let core: Core;
	let stateId: string;
	let originalEditor: string | undefined;
	const screen = createMockScreen();

	const setEditor = async (editorCommand: string) => {
		const config = await core.filesystem.loadConfig();
		if (!config) {
			throw new Error("Expected config to be initialized");
		}
		const updated: RoadmapConfig = {
			...config,
			defaultEditor: editorCommand,
		};
		await core.filesystem.saveConfig(updated);
	};

	const createEditorScript = async (name: string, source: string): Promise<string> => {
		const scriptPath = join(testDir, name);
		await writeFile(scriptPath, source);
		return scriptPath;
	};

	beforeEach(async () => {
		originalEditor = process.env.EDITOR;
		delete process.env.EDITOR;

		testDir = createUniqueTestDir("test-tui-edit-session");
		await mkdir(testDir, { recursive: true });
		core = new Core(testDir, { enableWatchers: true });
		await core.initializeProject("TUI Edit Session Test");

		const state: State = {
			id: "state-1",
			title: "Editor Flow State",
			status: "To Do",
			assignee: [],
			createdDate: "2026-02-11 20:00",
			labels: [],
			dependencies: [],
			rawContent: "## Description\n\nOriginal body",
		};
		await core.createState(state, false);
		stateId = state.id;
	});

	afterEach(async () => {
		if (originalEditor !== undefined) {
			process.env.EDITOR = originalEditor;
		} else {
			delete process.env.EDITOR;
		}
		await safeCleanup(testDir);
	});

	it("returns unchanged result when editor makes no file modifications", async () => {
		const noopScript = await createEditorScript("noop-editor.js", "process.exit(0);\n");
		await setEditor(`node ${noopScript}`);

		const result = await core.editStateInTui(stateId, screen);
		expect(result.changed).toBe(false);
		expect(result.reason).toBeUndefined();

		const reloaded = await core.filesystem.loadState(stateId);
		expect(reloaded?.updatedDate).toBeUndefined();
	});

	it("updates updated_date when editor changes state content", async () => {
		const editScript = await createEditorScript(
			"append-editor.js",
			`import { appendFileSync } from "node:fs";
const filePath = process.argv[2];
if (filePath) {
	appendFileSync(filePath, "\\nEdited from test\\n");
}
process.exit(0);
`,
		);
		await setEditor(`node ${editScript}`);

		const result = await core.editStateInTui(stateId, screen);
		expect(result.changed).toBe(true);
		expect(result.reason).toBeUndefined();
		expect(result.state).toBeTruthy();
		expect(result.state?.updatedDate).toBeTruthy();

		const stateContent = await core.getStateContent(stateId);
		expect(stateContent).toContain("updated_date:");
		expect(stateContent).toContain("Edited from test");
	});

	it("returns editor_failed without mutating metadata when editor exits non-zero", async () => {
		const failScript = await createEditorScript("fail-editor.js", "process.exit(2);\n");
		await setEditor(`node ${failScript}`);

		const beforeContent = await core.getStateContent(stateId);
		const result = await core.editStateInTui(stateId, screen);
		const afterContent = await core.getStateContent(stateId);

		expect(result.changed).toBe(false);
		expect(result.reason).toBe("editor_failed");
		expect(afterContent).toBe(beforeContent);

		const reloaded = await core.filesystem.loadState(stateId);
		expect(reloaded?.updatedDate).toBeUndefined();
	});
});
