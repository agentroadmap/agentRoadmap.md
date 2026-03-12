import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Core } from "../core/roadmap.ts";
import { executeStatusCallback } from "../utils/status-callback.ts";

describe("Status Change Callbacks", () => {
	describe("executeStatusCallback", () => {
		const testCwd = process.cwd();

		test("executes command with environment variables", async () => {
			const result = await executeStatusCallback({
				command: 'echo "State: $STATE_ID, Old: $OLD_STATUS, New: $NEW_STATUS, Title: $STATE_TITLE"',
				stateId: "state-123",
				oldStatus: "To Do",
				newStatus: "In Progress",
				stateTitle: "Test State",
				cwd: testCwd,
			});

			expect(result.success).toBe(true);
			expect(result.output).toContain("State: state-123");
			expect(result.output).toContain("Old: To Do");
			expect(result.output).toContain("New: In Progress");
			expect(result.output).toContain("Title: Test State");
		});

		test("returns success false for failing command", async () => {
			const result = await executeStatusCallback({
				command: "exit 1",
				stateId: "state-123",
				oldStatus: "To Do",
				newStatus: "Done",
				stateTitle: "Test State",
				cwd: testCwd,
			});

			expect(result.success).toBe(false);
			expect(result.exitCode).toBe(1);
		});

		test("returns error for empty command", async () => {
			const result = await executeStatusCallback({
				command: "",
				stateId: "state-123",
				oldStatus: "To Do",
				newStatus: "Done",
				stateTitle: "Test State",
				cwd: testCwd,
			});

			expect(result.success).toBe(false);
			expect(result.error).toBe("Empty command");
		});

		test("captures stderr on failure", async () => {
			const result = await executeStatusCallback({
				command: 'echo "error message" >&2 && exit 1',
				stateId: "state-123",
				oldStatus: "To Do",
				newStatus: "Done",
				stateTitle: "Test State",
				cwd: testCwd,
			});

			expect(result.success).toBe(false);
			expect(result.error).toContain("error message");
		});

		test("handles special characters in variables", async () => {
			const result = await executeStatusCallback({
				command: 'echo "$STATE_TITLE"',
				stateId: "state-123",
				oldStatus: "To Do",
				newStatus: "Done",
				stateTitle: 'State with "quotes" and $pecial chars',
				cwd: testCwd,
			});

			expect(result.success).toBe(true);
			expect(result.output).toContain('State with "quotes" and $pecial chars');
		});
	});

	describe("Core.updateStateFromInput with callbacks", () => {
		let testDir: string;
		let core: Core;
		let callbackOutputFile: string;

		beforeEach(async () => {
			testDir = join(tmpdir(), `roadmap-callback-test-${Date.now()}`);
			await mkdir(testDir, { recursive: true });
			await mkdir(join(testDir, "roadmap", "nodes"), { recursive: true });

			callbackOutputFile = join(testDir, "callback-output.txt");

			core = new Core(testDir);
		});

		afterEach(async () => {
			try {
				await rm(testDir, { recursive: true, force: true });
			} catch {
				// Ignore cleanup errors
			}
		});

		test("triggers global callback on status change", async () => {
			// Create config with onStatusChange
			const configContent = `projectName: Test
statuses:
  - To Do
  - In Progress
  - Done
labels: []
milestones: []
dateFormat: yyyy-mm-dd
onStatusChange: 'echo "$STATE_ID:$OLD_STATUS->$NEW_STATUS" > ${callbackOutputFile}'
`;
			await writeFile(join(testDir, "roadmap", "config.yml"), configContent);

			// Verify config was written correctly
			const writtenConfig = await Bun.file(join(testDir, "roadmap", "config.yml")).text();
			expect(writtenConfig).toContain("onStatusChange");

			// Create a state
			const { state } = await core.createStateFromInput({
				title: "Test Callback State",
				status: "To Do",
			});

			// Invalidate config cache to ensure fresh read
			core.fs.invalidateConfigCache();

			// Update status
			await core.updateStateFromInput(state.id, { status: "In Progress" });

			// Wait a bit for async callback
			await new Promise((resolve) => setTimeout(resolve, 200));

			// Check callback was executed
			const output = await Bun.file(callbackOutputFile).text();
			expect(output.trim()).toBe(`${state.id}:To Do->In Progress`);
		});

		test("per-state callback overrides global callback", async () => {
			// Create config with global onStatusChange
			const configContent = `projectName: Test
statuses:
  - To Do
  - In Progress
  - Done
labels: []
milestones: []
dateFormat: yyyy-mm-dd
onStatusChange: 'echo "global" > ${callbackOutputFile}'
`;
			await writeFile(join(testDir, "roadmap", "config.yml"), configContent);

			// Create a state with per-state callback
			const stateContent = `---
id: state-1
title: State with custom callback
status: To Do
assignee: []
created_date: 2025-01-01
labels: []
dependencies: []
onStatusChange: 'echo "per-state:$NEW_STATUS" > ${callbackOutputFile}'
---
`;
			await writeFile(join(testDir, "roadmap", "states", "state-1 - State with custom callback.md"), stateContent);

			// Update status
			await core.updateStateFromInput("state-1", { status: "Done" });

			// Wait a bit for async callback
			await new Promise((resolve) => setTimeout(resolve, 100));

			// Check per-state callback was executed (not global)
			const output = await Bun.file(callbackOutputFile).text();
			expect(output.trim()).toBe("per-state:Done");
		});

		test("no callback when status unchanged", async () => {
			// Create config with onStatusChange
			const configContent = `projectName: Test
statuses:
  - To Do
  - In Progress
  - Done
labels: []
milestones: []
dateFormat: yyyy-mm-dd
onStatusChange: 'echo "callback-ran" > ${callbackOutputFile}'
`;
			await writeFile(join(testDir, "roadmap", "config.yml"), configContent);

			// Create a state
			const { state } = await core.createStateFromInput({
				title: "Test No Callback State",
				status: "To Do",
			});

			// Update something other than status
			await core.updateStateFromInput(state.id, { title: "Updated Title" });

			// Wait a bit
			await new Promise((resolve) => setTimeout(resolve, 100));

			// Check callback was NOT executed
			const exists = await Bun.file(callbackOutputFile).exists();
			expect(exists).toBe(false);
		});

		test("no callback when no callback configured", async () => {
			// Create config without onStatusChange
			const configContent = `projectName: Test
statuses:
  - To Do
  - In Progress
  - Done
labels: []
milestones: []
dateFormat: yyyy-mm-dd
`;
			await writeFile(join(testDir, "roadmap", "config.yml"), configContent);

			// Create a state
			const { state } = await core.createStateFromInput({
				title: "Test No Config State",
				status: "To Do",
			});

			// Update status - should not fail even without callback
			const result = await core.updateStateFromInput(state.id, { status: "In Progress" });
			expect(result.status).toBe("In Progress");
		});

		test("callback failure does not block status change", async () => {
			// Create config with failing callback
			const configContent = `projectName: Test
statuses:
  - To Do
  - In Progress
  - Done
labels: []
milestones: []
dateFormat: yyyy-mm-dd
onStatusChange: 'exit 1'
`;
			await writeFile(join(testDir, "roadmap", "config.yml"), configContent);

			// Create a state
			const { state } = await core.createStateFromInput({
				title: "Test Failing Callback State",
				status: "To Do",
			});

			// Update status - should succeed even if callback fails
			const result = await core.updateStateFromInput(state.id, { status: "Done" });
			expect(result.status).toBe("Done");
		});

		test("triggers callback when reorderState changes status", async () => {
			// Create config with onStatusChange
			const configContent = `projectName: Test
statuses:
  - To Do
  - In Progress
  - Done
labels: []
milestones: []
dateFormat: yyyy-mm-dd
onStatusChange: 'echo "$STATE_ID:$OLD_STATUS->$NEW_STATUS" >> ${callbackOutputFile}'
`;
			await writeFile(join(testDir, "roadmap", "config.yml"), configContent);

			// Create a state in "To Do"
			const { state } = await core.createStateFromInput({
				title: "Reorder Callback Test",
				status: "To Do",
			});

			// Invalidate config cache
			core.fs.invalidateConfigCache();

			// Reorder state to "In Progress" column (simulating board drag)
			await core.reorderState({
				stateId: state.id,
				targetStatus: "In Progress",
				orderedStateIds: [state.id],
			});

			// Wait for callback
			await new Promise((resolve) => setTimeout(resolve, 200));

			// Check callback was executed
			const output = await Bun.file(callbackOutputFile).text();
			expect(output.trim()).toBe(`${state.id}:To Do->In Progress`);
		});
	});
});
