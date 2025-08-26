import type { FSWatcher } from "bun";
import type { Core } from "../core/backlog.ts";
import type { Task } from "../types/index.ts";

export interface TaskWatcherCallbacks {
	/** Called when a new task file is created */
	onTaskAdded?: (task: Task) => void | Promise<void>;
	/** Called when an existing task file is modified */
	onTaskChanged?: (task: Task) => void | Promise<void>;
	/** Called when a task file is removed */
	onTaskRemoved?: (taskId: string) => void | Promise<void>;
}

/**
 * Watch the backlog/tasks directory for changes and emit incremental updates.
 * Uses Bun.watch which is available in Bun runtime.
 */
export function watchTasks(core: Core, callbacks: TaskWatcherCallbacks): FSWatcher {
	const tasksDir = core.filesystem.tasksDir;

	const watcher = Bun.watch(tasksDir, {
		recursive: false,
		async onChange(event, filePath) {
			const fileName = filePath.split("/").pop();
			if (!fileName || !fileName.startsWith("task-") || !fileName.endsWith(".md")) {
				return;
			}
			const taskId = fileName.split(" ")[0];

			if (event === "delete") {
				await callbacks.onTaskRemoved?.(taskId);
				return;
			}

			const task = await core.filesystem.loadTask(taskId);
			if (!task) {
				return;
			}
			if (event === "create") {
				await callbacks.onTaskAdded?.(task);
			} else if (event === "modify") {
				await callbacks.onTaskChanged?.(task);
			}
		},
	});

	return watcher;
}
