import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { $ } from "bun";
import { Core } from "../core/roadmap.ts";
import { getStateFilename, getStatePath, normalizeStateId, stateFileExists, stateIdsEqual } from "../utils/state-path.ts";
import { createUniqueTestDir, safeCleanup } from "./test-utils.ts";

describe("State path utilities", () => {
	let TEST_DIR: string;
	let core: Core;

	beforeEach(async () => {
		TEST_DIR = createUniqueTestDir("test-state-path");
		await rm(TEST_DIR, { recursive: true, force: true }).catch(() => {});
		await mkdir(TEST_DIR, { recursive: true });

		// Configure git for tests - required for CI
		await $`git init`.cwd(TEST_DIR).quiet();
		await $`git config user.email test@example.com`.cwd(TEST_DIR).quiet();
		await $`git config user.name "Test User"`.cwd(TEST_DIR).quiet();

		core = new Core(TEST_DIR);
		await core.initializeProject("Test Project");

		// Create some test state files
		const statesDir = core.filesystem.statesDir;
		await writeFile(join(statesDir, "state-123 - Test State.md"), "# Test State 123");
		await writeFile(join(statesDir, "state-456 - Another State.md"), "# Another State 456");
		await writeFile(join(statesDir, "state-789 - Final State.md"), "# Final State 789");
		// Additional: padded and dotted ids
		await writeFile(join(statesDir, "state-0001 - Padded One.md"), "# Padded One");
		await writeFile(join(statesDir, "state-3.01 - Substate Padded.md"), "# Substate Padded 3.01");
	});

	afterEach(async () => {
		try {
			await safeCleanup(TEST_DIR);
		} catch {
			// Ignore cleanup errors - the unique directory names prevent conflicts
		}
	});

	describe("normalizeStateId", () => {
		it("should add uppercase STATE- prefix if missing", () => {
			expect(normalizeStateId("123")).toBe("STATE-123");
			expect(normalizeStateId("456")).toBe("STATE-456");
		});

		it("should normalize existing prefix to uppercase", () => {
			expect(normalizeStateId("state-123")).toBe("STATE-123");
			expect(normalizeStateId("STATE-456")).toBe("STATE-456");
		});

		it("should preserve non-default prefixes when present", () => {
			expect(normalizeStateId("JIRA-456")).toBe("JIRA-456");
			expect(normalizeStateId("jira-789")).toBe("JIRA-789");
		});

		it("should handle empty strings", () => {
			expect(normalizeStateId("")).toBe("STATE-");
		});

		it("should normalize mixed-case prefixes to uppercase", () => {
			expect(normalizeStateId("STATE-001")).toBe("STATE-001");
			expect(normalizeStateId("State-42")).toBe("STATE-42");
			expect(normalizeStateId("state-99")).toBe("STATE-99");
		});

		it("should work with custom prefixes (uppercase output)", () => {
			expect(normalizeStateId("123", "JIRA")).toBe("JIRA-123");
			expect(normalizeStateId("JIRA-456", "JIRA")).toBe("JIRA-456");
			expect(normalizeStateId("jira-789", "JIRA")).toBe("JIRA-789");
		});

		it("should work with draft prefix (uppercase output)", () => {
			expect(normalizeStateId("1", "draft")).toBe("DRAFT-1");
			expect(normalizeStateId("draft-5", "draft")).toBe("DRAFT-5");
		});
	});

	describe("stateIdsEqual", () => {
		it("should compare IDs case-insensitively", () => {
			expect(stateIdsEqual("state-123", "STATE-123")).toBe(true);
			expect(stateIdsEqual("State-456", "state-456")).toBe(true);
		});

		it("should handle numeric comparison (leading zeros)", () => {
			expect(stateIdsEqual("state-1", "state-01")).toBe(true);
			expect(stateIdsEqual("state-001", "state-1")).toBe(true);
		});

		it("should compare substate IDs correctly", () => {
			expect(stateIdsEqual("state-1.2", "state-1.2")).toBe(true);
			expect(stateIdsEqual("state-1.2", "state-1.02")).toBe(true);
			expect(stateIdsEqual("state-1.2", "state-1.3")).toBe(false);
		});

		it("should work with custom prefixes", () => {
			expect(stateIdsEqual("JIRA-100", "jira-100", "JIRA")).toBe(true);
			expect(stateIdsEqual("100", "JIRA-100", "JIRA")).toBe(true);
		});

		it("should return false for different IDs", () => {
			expect(stateIdsEqual("state-1", "state-2")).toBe(false);
			expect(stateIdsEqual("state-1.1", "state-1.2")).toBe(false);
		});

		it("should NOT match IDs with non-numeric suffixes (prevent parseInt coercion)", () => {
			// IDs with trailing letters should NOT match the numeric portion
			// This tests the extractStateBody regex validation
			expect(stateIdsEqual("state-123a", "state-123")).toBe(false);
			expect(stateIdsEqual("state-1.2x", "state-1.2")).toBe(false);
			expect(stateIdsEqual("123a", "state-123")).toBe(false);
		});
	});

	describe("getStatePath", () => {
		it("should return full path for existing state", async () => {
			const path = await getStatePath("123", core);
			expect(path).toBeTruthy();
			expect(path).toContain("state-123 - Test State.md");
			expect(path).toContain(core.filesystem.statesDir);
		});

		it("should NOT match when input has non-numeric characters (e.g., typos)", async () => {
			// "123a" should NOT match state-123 (prevent parseInt coercion bugs)
			const path = await getStatePath("123a", core);
			expect(path).toBeNull();

			// "456x" should NOT match state-456
			const path2 = await getStatePath("456x", core);
			expect(path2).toBeNull();

			// "1.2x" should NOT match any substate
			const path3 = await getStatePath("1.2x", core);
			expect(path3).toBeNull();

			// Leading non-numeric characters
			const path4 = await getStatePath("a123", core);
			expect(path4).toBeNull();

			// Mixed non-numeric in dotted segments
			const path5 = await getStatePath("3.a1", core);
			expect(path5).toBeNull();

			// Hex-like input should not match decimal
			const path6 = await getStatePath("0x123", core);
			expect(path6).toBeNull();
		});

		it("should work with state- prefix", async () => {
			const path = await getStatePath("state-456", core);
			expect(path).toBeTruthy();
			expect(path).toContain("state-456 - Another State.md");
		});

		it("should resolve zero-padded numeric IDs to the same state", async () => {
			// File exists as state-0001; query with 1
			const path1 = await getStatePath("1", core);
			expect(path1).toBeTruthy();
			expect(path1).toContain("state-0001 - Padded One.md");

			// Query with zero-padded input for non-padded file (123)
			const path2 = await getStatePath("0123", core);
			expect(path2).toBeTruthy();
			expect(path2).toContain("state-123 - Test State.md");
		});

		it("should resolve case-insensitive state IDs", async () => {
			const uppercase = await getStatePath("STATE-0001", core);
			expect(uppercase).toBeTruthy();
			expect(uppercase).toContain("state-0001 - Padded One.md");

			const mixedCase = await getStatePath("State-456", core);
			expect(mixedCase).toBeTruthy();
			expect(mixedCase).toContain("state-456 - Another State.md");
		});

		it("should return null for non-existent state", async () => {
			const path = await getStatePath("999", core);
			expect(path).toBeNull();
		});

		it("should handle errors gracefully", async () => {
			// Pass invalid core to trigger error
			const path = await getStatePath("123", null as unknown as Core);
			expect(path).toBeNull();
		});
	});

	describe("getStateFilename", () => {
		it("should return filename for existing state", async () => {
			const filename = await getStateFilename("789", core);
			expect(filename).toBe("state-789 - Final State.md");
		});

		it("should resolve dotted IDs ignoring leading zeros in segments", async () => {
			const filename = await getStateFilename("3.1", core);
			expect(filename).toBe("state-3.01 - Substate Padded.md");
		});

		it("should resolve case-insensitive IDs when fetching filenames", async () => {
			const filename = await getStateFilename("STATE-789", core);
			expect(filename).toBe("state-789 - Final State.md");
		});

		it("should return null for non-existent state", async () => {
			const filename = await getStateFilename("999", core);
			expect(filename).toBeNull();
		});
	});

	describe("stateFileExists", () => {
		it("should return true for existing states", async () => {
			const exists = await stateFileExists("123", core);
			expect(exists).toBe(true);
		});

		it("should return false for non-existent states", async () => {
			const exists = await stateFileExists("999", core);
			expect(exists).toBe(false);
		});

		it("should work with state- prefix", async () => {
			const exists = await stateFileExists("state-456", core);
			expect(exists).toBe(true);
		});
	});

	describe("integration with Core default", () => {
		it("should work without explicit core parameter when in valid project", async () => {
			// Change to test directory to use default Core
			const originalCwd = process.cwd();
			process.chdir(TEST_DIR);

			try {
				const path = await getStatePath("123");
				expect(path).toBeTruthy();
				expect(path).toContain("state-123 - Test State.md");
			} finally {
				process.chdir(originalCwd);
			}
		});
	});

	describe("numeric ID lookup with custom prefix", () => {
		beforeEach(async () => {
			// Create states with custom prefix (simulating configured prefix)
			const statesDir = core.filesystem.statesDir;
			await writeFile(join(statesDir, "back-358 - Custom Prefix State.md"), "# Custom Prefix State");
			await writeFile(join(statesDir, "back-5.1 - Custom Substate.md"), "# Custom Substate");
		});

		it("should find state by numeric ID when file has custom prefix", async () => {
			// Numeric-only lookup should find "back-358" when searching all files
			const path = await getStatePath("358", core);
			expect(path).toBeTruthy();
			expect(path).toContain("back-358 - Custom Prefix State.md");
		});

		it("should find substate by dotted numeric ID with custom prefix", async () => {
			const path = await getStatePath("5.1", core);
			expect(path).toBeTruthy();
			expect(path).toContain("back-5.1 - Custom Substate.md");
		});

		it("should NOT match numeric ID with typo even when custom prefix exists", async () => {
			// "358a" should NOT match "back-358" (the core parseInt coercion bug)
			const path = await getStatePath("358a", core);
			expect(path).toBeNull();

			// "5.1x" should NOT match "back-5.1"
			const path2 = await getStatePath("5.1x", core);
			expect(path2).toBeNull();
		});

		it("should find state when using full prefixed ID", async () => {
			const path = await getStatePath("back-358", core);
			expect(path).toBeTruthy();
			expect(path).toContain("back-358 - Custom Prefix State.md");
		});

		it("should be case-insensitive for prefixed lookups", async () => {
			const path = await getStatePath("BACK-358", core);
			expect(path).toBeTruthy();
			expect(path).toContain("back-358 - Custom Prefix State.md");
		});
	});

	describe("getStateFilename with non-numeric input", () => {
		it("should NOT match filenames when input has non-numeric characters", async () => {
			// Same validation as getStatePath applies to getStateFilename
			const filename = await getStateFilename("789x", core);
			expect(filename).toBeNull();

			const filename2 = await getStateFilename("3.a1", core);
			expect(filename2).toBeNull();
		});
	});
});
