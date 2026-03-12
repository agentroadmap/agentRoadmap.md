import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { $ } from "bun";
import { Core } from "../core/roadmap.ts";
import { createUniqueTestDir, safeCleanup } from "./test-utils.ts";

const CLI_PATH = join(process.cwd(), "src/cli.ts");

let TEST_DIR: string;

describe("CLI Zero Padded IDs Feature", () => {
	beforeEach(async () => {
		TEST_DIR = createUniqueTestDir("test-zero-padded-ids");
		try {
			await rm(TEST_DIR, { recursive: true, force: true });
		} catch {
			// Ignore cleanup errors
		}
		await mkdir(TEST_DIR, { recursive: true });

		// Initialize git and roadmap project
		await $`git init -b main`.cwd(TEST_DIR).quiet();
		await $`git config user.name "Test User"`.cwd(TEST_DIR).quiet();
		await $`git config user.email test@example.com`.cwd(TEST_DIR).quiet();

		const core = new Core(TEST_DIR);
		await core.initializeProject("Padding Test", false); // No auto-commit for init

		// Enable zero padding in the config
		const config = await core.filesystem.loadConfig();
		if (config) {
			config.zeroPaddedIds = 3;
			config.autoCommit = false; // Disable auto-commit for easier testing
			await core.filesystem.saveConfig(config);
		}
	});

	afterEach(async () => {
		try {
			await safeCleanup(TEST_DIR);
		} catch {
			// Ignore cleanup errors - the unique directory names prevent conflicts
		}
	});

	test("should create a state with a zero-padded ID", async () => {
		const result = await $`bun ${CLI_PATH} state create "Padded State"`.cwd(TEST_DIR).quiet();
		expect(result.exitCode).toBe(0);

		const statesDir = join(TEST_DIR, "roadmap", "nodes");
		const files = await readdir(statesDir);
		expect(files.length).toBe(1);
		expect(files[0]).toStartWith("state-001");
	});

	test("should create a document with a zero-padded ID", async () => {
		const result = await $`bun ${CLI_PATH} doc create "Padded Doc"`.cwd(TEST_DIR).quiet();
		expect(result.exitCode).toBe(0);

		const docsDir = join(TEST_DIR, "roadmap", "docs");
		const files = await readdir(docsDir);
		expect(files.length).toBe(1);
		expect(files[0]).toStartWith("doc-001");
	});

	test("should create a decision with a zero-padded ID", async () => {
		const result = await $`bun ${CLI_PATH} decision create "Padded Decision"`.cwd(TEST_DIR).quiet();
		expect(result.exitCode).toBe(0);

		const decisionsDir = join(TEST_DIR, "roadmap", "decisions");
		const files = await readdir(decisionsDir);
		expect(files.length).toBe(1);
		expect(files[0]).toStartWith("decision-001");
	});

	test("should correctly increment a padded state ID", async () => {
		await $`bun ${CLI_PATH} state create "First Padded State"`.cwd(TEST_DIR).quiet();
		const result = await $`bun ${CLI_PATH} state create "Second Padded State"`.cwd(TEST_DIR).quiet();
		expect(result.exitCode).toBe(0);

		const statesDir = join(TEST_DIR, "roadmap", "nodes");
		const files = await readdir(statesDir);
		expect(files.length).toBe(2);
		expect(files.some((file) => file.startsWith("state-002"))).toBe(true);
	});

	test("should create a sub-state with a zero-padded ID", async () => {
		// Create parent state first
		await $`bun ${CLI_PATH} state create "Parent State"`.cwd(TEST_DIR).quiet();

		// Create sub-state
		const result = await $`bun ${CLI_PATH} state create "Padded Sub-state" -p state-001`.cwd(TEST_DIR).quiet();
		expect(result.exitCode).toBe(0);

		const statesDir = join(TEST_DIR, "roadmap", "nodes");
		const files = await readdir(statesDir);
		expect(files.length).toBe(2);
		expect(files.some((file) => file.startsWith("state-001.01"))).toBe(true);
	});
});
