import { describe, expect, test } from "bun:test";
import { type RoadmapConfig, EntityType } from "../types/index.ts";
import {
	buildFilenameIdRegex,
	buildGlobPattern,
	buildIdRegex,
	DEFAULT_PREFIX_CONFIG,
	extractAnyPrefix,
	extractIdBody,
	extractIdNumbers,
	generateNextId,
	generateNextSubstateId,
	getDefaultPrefixConfig,
	getPrefixForType,
	hasPrefix,
	idsEqual,
	mergePrefixConfig,
	normalizeId,
} from "../utils/prefix-config.ts";

describe("prefix-config", () => {
	describe("getDefaultPrefixConfig", () => {
		test("returns default state prefix", () => {
			const config = getDefaultPrefixConfig();
			expect(config.state).toBe("state");
		});

		test("returns a new object each time", () => {
			const config1 = getDefaultPrefixConfig();
			const config2 = getDefaultPrefixConfig();
			expect(config1).not.toBe(config2);
			expect(config1).toEqual(config2);
		});
	});

	describe("mergePrefixConfig", () => {
		test("returns defaults when no config provided", () => {
			const config = mergePrefixConfig();
			expect(config).toEqual(DEFAULT_PREFIX_CONFIG);
		});

		test("returns defaults when empty object provided", () => {
			const config = mergePrefixConfig({});
			expect(config).toEqual(DEFAULT_PREFIX_CONFIG);
		});

		test("merges partial config with defaults", () => {
			const config = mergePrefixConfig({ state: "JIRA" });
			expect(config.state).toBe("JIRA");
		});

		test("uses custom state value when provided", () => {
			const config = mergePrefixConfig({ state: "issue" });
			expect(config.state).toBe("issue");
		});
	});

	describe("normalizeId", () => {
		test("adds uppercase prefix to numeric ID", () => {
			expect(normalizeId("123", "state")).toBe("STATE-123");
			expect(normalizeId("456", "draft")).toBe("DRAFT-456");
		});

		test("normalizes existing prefix to uppercase", () => {
			expect(normalizeId("state-123", "state")).toBe("STATE-123");
			expect(normalizeId("draft-456", "draft")).toBe("DRAFT-456");
		});

		test("normalizes mixed case to uppercase", () => {
			expect(normalizeId("STATE-123", "state")).toBe("STATE-123");
			expect(normalizeId("State-456", "state")).toBe("STATE-456");
		});

		test("works with custom prefixes (uppercase output)", () => {
			expect(normalizeId("789", "JIRA")).toBe("JIRA-789");
			expect(normalizeId("JIRA-789", "JIRA")).toBe("JIRA-789");
			expect(normalizeId("jira-789", "JIRA")).toBe("JIRA-789");
			expect(normalizeId("789", "jira")).toBe("JIRA-789");
		});

		test("handles hierarchical IDs", () => {
			expect(normalizeId("5.2.1", "state")).toBe("STATE-5.2.1");
			expect(normalizeId("state-5.2.1", "state")).toBe("STATE-5.2.1");
		});

		test("trims whitespace", () => {
			expect(normalizeId("  123  ", "state")).toBe("STATE-123");
			expect(normalizeId("  state-123  ", "state")).toBe("STATE-123");
		});
	});

	describe("extractIdBody", () => {
		test("extracts body from prefixed ID", () => {
			expect(extractIdBody("state-123", "state")).toBe("123");
			expect(extractIdBody("draft-456", "draft")).toBe("456");
		});

		test("handles hierarchical IDs", () => {
			expect(extractIdBody("state-5.2.1", "state")).toBe("5.2.1");
		});

		test("returns original if no prefix match", () => {
			expect(extractIdBody("123", "state")).toBe("123");
			expect(extractIdBody("draft-123", "state")).toBe("draft-123");
		});

		test("is case-insensitive for prefix", () => {
			expect(extractIdBody("STATE-123", "state")).toBe("123");
			expect(extractIdBody("State-123", "state")).toBe("123");
		});

		test("works with custom prefixes", () => {
			expect(extractIdBody("JIRA-789", "JIRA")).toBe("789");
			expect(extractIdBody("issue-42", "issue")).toBe("42");
		});
	});

	describe("extractIdNumbers", () => {
		test("extracts single number", () => {
			expect(extractIdNumbers("state-123", "state")).toEqual([123]);
		});

		test("extracts hierarchical numbers", () => {
			expect(extractIdNumbers("state-5.2.1", "state")).toEqual([5, 2, 1]);
			expect(extractIdNumbers("state-10.20.30", "state")).toEqual([10, 20, 30]);
		});

		test("handles non-numeric body", () => {
			expect(extractIdNumbers("state-abc", "state")).toEqual([0]);
		});

		test("handles mixed numeric/non-numeric", () => {
			// Each segment is parsed independently
			expect(extractIdNumbers("state-5.abc.3", "state")).toEqual([5, 0, 3]);
		});

		test("works with custom prefixes", () => {
			expect(extractIdNumbers("JIRA-456", "JIRA")).toEqual([456]);
		});
	});

	describe("buildGlobPattern", () => {
		test("builds correct glob pattern", () => {
			expect(buildGlobPattern("state")).toBe("state-*.md");
			expect(buildGlobPattern("draft")).toBe("draft-*.md");
			expect(buildGlobPattern("JIRA")).toBe("JIRA-*.md");
		});
	});

	describe("buildIdRegex", () => {
		test("matches simple IDs", () => {
			const regex = buildIdRegex("state");
			expect("state-123".match(regex)).toBeTruthy();
			expect("state-123".match(regex)?.[1]).toBe("123");
		});

		test("matches hierarchical IDs", () => {
			const regex = buildIdRegex("state");
			expect("state-5.2.1".match(regex)?.[1]).toBe("5.2.1");
		});

		test("is case-insensitive", () => {
			const regex = buildIdRegex("state");
			expect("STATE-123".match(regex)).toBeTruthy();
			expect("State-456".match(regex)).toBeTruthy();
		});

		test("does not match wrong prefix", () => {
			const regex = buildIdRegex("state");
			expect("draft-123".match(regex)).toBeFalsy();
		});

		test("works with custom prefixes", () => {
			const regex = buildIdRegex("JIRA");
			expect("JIRA-789".match(regex)?.[1]).toBe("789");
			expect("jira-789".match(regex)?.[1]).toBe("789");
		});

		test("only matches at start of string", () => {
			const regex = buildIdRegex("state");
			expect("prefix-state-123".match(regex)).toBeFalsy();
		});
	});

	describe("buildFilenameIdRegex", () => {
		test("extracts ID from filename", () => {
			const regex = buildFilenameIdRegex("state");
			const match = "state-123 - Some Title.md".match(regex);
			expect(match?.[1]).toBe("123");
		});

		test("handles hierarchical IDs in filenames", () => {
			const regex = buildFilenameIdRegex("state");
			const match = "state-5.2 - Substate Title.md".match(regex);
			expect(match?.[1]).toBe("5.2");
		});
	});

	describe("hasPrefix", () => {
		test("returns true for matching prefix", () => {
			expect(hasPrefix("state-123", "state")).toBe(true);
			expect(hasPrefix("draft-456", "draft")).toBe(true);
		});

		test("is case-insensitive", () => {
			expect(hasPrefix("STATE-123", "state")).toBe(true);
			expect(hasPrefix("State-456", "state")).toBe(true);
		});

		test("returns false for non-matching prefix", () => {
			expect(hasPrefix("draft-123", "state")).toBe(false);
			expect(hasPrefix("123", "state")).toBe(false);
		});

		test("trims whitespace", () => {
			expect(hasPrefix("  state-123  ", "state")).toBe(true);
		});
	});

	describe("idsEqual", () => {
		test("returns true for identical IDs", () => {
			expect(idsEqual("state-123", "state-123", "state")).toBe(true);
		});

		test("is case-insensitive for prefix", () => {
			expect(idsEqual("state-123", "STATE-123", "state")).toBe(true);
			expect(idsEqual("STATE-123", "state-123", "state")).toBe(true);
		});

		test("returns false for different IDs", () => {
			expect(idsEqual("state-123", "state-456", "state")).toBe(false);
		});

		test("handles IDs without prefix", () => {
			expect(idsEqual("123", "state-123", "state")).toBe(true);
		});
	});

	describe("generateNextId", () => {
		test("generates next ID in sequence (uppercase)", () => {
			expect(generateNextId(["state-1", "state-2", "state-3"], "state")).toBe("STATE-4");
		});

		test("handles gaps in sequence", () => {
			expect(generateNextId(["state-1", "state-5", "state-10"], "state")).toBe("STATE-11");
		});

		test("returns STATE-1 for empty list", () => {
			expect(generateNextId([], "state")).toBe("STATE-1");
		});

		test("ignores substates when finding max", () => {
			expect(generateNextId(["state-1", "state-1.1", "state-1.2", "state-2"], "state")).toBe("STATE-3");
		});

		test("handles zero padding", () => {
			expect(generateNextId(["state-001", "state-002"], "state", 3)).toBe("STATE-003");
		});

		test("works with custom prefixes (uppercase)", () => {
			expect(generateNextId(["JIRA-100", "JIRA-101"], "JIRA")).toBe("JIRA-102");
		});

		test("ignores IDs with wrong prefix", () => {
			expect(generateNextId(["state-5", "draft-10", "state-3"], "state")).toBe("STATE-6");
		});
	});

	describe("generateNextSubstateId", () => {
		test("generates next substate ID (uppercase)", () => {
			expect(generateNextSubstateId(["state-5", "state-5.1", "state-5.2"], "state-5", "state")).toBe("STATE-5.3");
		});

		test("returns .1 for first substate", () => {
			expect(generateNextSubstateId(["state-5"], "state-5", "state")).toBe("STATE-5.1");
		});

		test("handles gaps in substate sequence", () => {
			expect(generateNextSubstateId(["state-5", "state-5.1", "state-5.5"], "state-5", "state")).toBe("STATE-5.6");
		});

		test("handles zero padding", () => {
			expect(generateNextSubstateId(["state-5", "state-5.01"], "state-5", "state", 2)).toBe("STATE-5.02");
		});

		test("works with custom prefixes", () => {
			expect(generateNextSubstateId(["JIRA-100", "JIRA-100.1"], "JIRA-100", "JIRA")).toBe("JIRA-100.2");
		});

		test("handles unnormalized parent ID", () => {
			expect(generateNextSubstateId(["state-5", "state-5.1"], "5", "state")).toBe("STATE-5.2");
		});
	});

	describe("getPrefixForType", () => {
		test("returns default state prefix without config", () => {
			expect(getPrefixForType(EntityType.State)).toBe("state");
		});

		test("returns configured state prefix", () => {
			const config = { prefixes: { state: "JIRA" } } as RoadmapConfig;
			expect(getPrefixForType(EntityType.State, config)).toBe("JIRA");
		});

		test("returns default state prefix when config has no prefixes", () => {
			const config = {} as RoadmapConfig;
			expect(getPrefixForType(EntityType.State, config)).toBe("state");
		});

		test("returns hardcoded draft prefix (not configurable)", () => {
			expect(getPrefixForType(EntityType.Draft)).toBe("draft");
		});

		test("draft prefix is always hardcoded regardless of config", () => {
			const config = { prefixes: { state: "JIRA" } } as RoadmapConfig;
			// Draft prefix is hardcoded, not part of config
			expect(getPrefixForType(EntityType.Draft, config)).toBe("draft");
		});

		test("returns doc prefix for Document type", () => {
			expect(getPrefixForType(EntityType.Document)).toBe("doc");
		});

		test("returns decision prefix for Decision type", () => {
			expect(getPrefixForType(EntityType.Decision)).toBe("decision");
		});
	});

	describe("extractAnyPrefix", () => {
		test("extracts state prefix", () => {
			expect(extractAnyPrefix("state-123")).toBe("state");
		});

		test("extracts uppercase prefix", () => {
			expect(extractAnyPrefix("STATE-123")).toBe("state");
		});

		test("extracts custom prefix", () => {
			expect(extractAnyPrefix("JIRA-456")).toBe("jira");
		});

		test("extracts draft prefix", () => {
			expect(extractAnyPrefix("draft-1")).toBe("draft");
		});

		test("returns null for plain number", () => {
			expect(extractAnyPrefix("123")).toBe(null);
		});

		test("returns null for empty string", () => {
			expect(extractAnyPrefix("")).toBe(null);
		});

		test("returns null for null/undefined", () => {
			expect(extractAnyPrefix(null as unknown as string)).toBe(null);
			expect(extractAnyPrefix(undefined as unknown as string)).toBe(null);
		});

		test("handles substate IDs", () => {
			expect(extractAnyPrefix("state-5.2.1")).toBe("state");
		});

		test("handles word IDs", () => {
			expect(extractAnyPrefix("bug-fix-login")).toBe("bug");
		});
	});
});
