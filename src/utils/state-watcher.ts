import { type FSWatcher, watch } from "node:fs";
import { join } from "node:path";
import type { Core } from "../core/roadmap.ts";
import type { State } from "../types/index.ts";
import { hasAnyPrefix } from "./prefix-config.ts";

export interface StateWatcherCallbacks {
	/** Called when a new state file is created */
	onStateAdded?: (state: State) => void | Promise<void>;
	/** Called when an existing state file is modified */
	onStateChanged?: (state: State) => void | Promise<void>;
	/** Called when a state file is removed */
	onStateRemoved?: (stateId: string) => void | Promise<void>;
}

/**
 * Watch the roadmap/states directory for changes and emit incremental updates.
 * Uses node:fs.watch as implemented by Bun runtime.
 */
export function watchStates(core: Core, callbacks: StateWatcherCallbacks): { stop: () => void } {
	const statesDir = core.filesystem.statesDir;

	const watcher: FSWatcher = watch(statesDir, { recursive: false }, async (eventType, filename) => {
		// Normalize filename to a string when available
		let fileName: string | undefined;
		if (typeof filename === "string") {
			fileName = filename;
		} else if (filename != null) {
			fileName = String(filename);
		}
		// Accept any prefix pattern (state-, draft-, JIRA-, etc.) for state files
		const [stateId] = fileName?.split(" ") ?? [];
		if (!fileName || !stateId || !hasAnyPrefix(stateId) || !fileName.endsWith(".md")) {
			return;
		}

		if (eventType === "change") {
			const state = await core.filesystem.loadState(stateId);
			if (state) {
				await callbacks.onStateChanged?.(state);
			}
			return;
		}

		if (eventType === "rename") {
			// "rename" can be create, delete, or rename. Check if file exists.
			try {
				const fullPath = join(statesDir, fileName);
				const exists = await Bun.file(fullPath).exists();

				if (!exists) {
					await callbacks.onStateRemoved?.(stateId);
					return;
				}

				const state = await core.filesystem.loadState(stateId);
				if (state) {
					// Treat as a change; handlers may add if not present
					await callbacks.onStateChanged?.(state);
				}
			} catch {
				// Ignore transient errors
			}
		}
	});

	return {
		stop() {
			try {
				watcher.close();
			} catch {}
		},
	};
}
