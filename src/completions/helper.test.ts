import { describe, expect, test } from "bun:test";
import { parseCompletionContext } from "./helper.ts";

describe("parseCompletionContext", () => {
	test("parses empty command line", () => {
		const context = parseCompletionContext("roadmap ", 8);
		expect(context.command).toBeNull();
		expect(context.subcommand).toBeNull();
		expect(context.partial).toBe("");
		expect(context.lastFlag).toBeNull();
	});

	test("parses partial command", () => {
		const context = parseCompletionContext("roadmap tas", 11);
		expect(context.command).toBeNull();
		expect(context.partial).toBe("tas");
	});

	test("parses complete command", () => {
		const context = parseCompletionContext("roadmap state ", 13);
		expect(context.command).toBe("state");
		expect(context.subcommand).toBeNull();
		expect(context.partial).toBe("");
	});

	test("parses partial subcommand", () => {
		const context = parseCompletionContext("roadmap state ed", 15);
		expect(context.command).toBe("state");
		expect(context.subcommand).toBeNull();
		expect(context.partial).toBe("ed");
	});

	test("parses complete subcommand", () => {
		const context = parseCompletionContext("roadmap state edit ", 18);
		expect(context.command).toBe("state");
		expect(context.subcommand).toBe("edit");
		expect(context.partial).toBe("");
	});

	test("parses partial argument", () => {
		const context = parseCompletionContext("roadmap state edit state-", 23);
		expect(context.command).toBe("state");
		expect(context.subcommand).toBe("edit");
		expect(context.partial).toBe("state-");
	});

	test("parses flag", () => {
		const context = parseCompletionContext("roadmap state create --status ", 29);
		expect(context.command).toBe("state");
		expect(context.subcommand).toBe("create");
		expect(context.lastFlag).toBe("--status");
		expect(context.partial).toBe("");
	});

	test("parses partial flag value", () => {
		const context = parseCompletionContext("roadmap state create --status In", 31);
		expect(context.command).toBe("state");
		expect(context.subcommand).toBe("create");
		expect(context.lastFlag).toBe("--status");
		expect(context.partial).toBe("In");
	});

	test("handles quoted strings", () => {
		const context = parseCompletionContext('roadmap state create "test state" --status ', 41);
		expect(context.command).toBe("state");
		expect(context.subcommand).toBe("create");
		expect(context.lastFlag).toBe("--status");
		expect(context.partial).toBe("");
	});

	test("handles multiple flags", () => {
		const context = parseCompletionContext("roadmap state create --priority high --status ", 46);
		expect(context.command).toBe("state");
		expect(context.subcommand).toBe("create");
		expect(context.lastFlag).toBe("--status");
		expect(context.partial).toBe("");
	});

	test("parses completion subcommand", () => {
		const context = parseCompletionContext("roadmap completion install ", 27);
		expect(context.command).toBe("completion");
		expect(context.subcommand).toBe("install");
		expect(context.partial).toBe("");
	});

	test("handles cursor in middle of line", () => {
		// Cursor at position 13 is after "roadmap state " (space included)
		const context = parseCompletionContext("roadmap state edit", 13);
		expect(context.command).toBe("state");
		expect(context.subcommand).toBeNull();
		expect(context.partial).toBe("");
	});

	test("counts argument position correctly", () => {
		const context = parseCompletionContext("roadmap state edit state-1 ", 25);
		expect(context.command).toBe("state");
		expect(context.subcommand).toBe("edit");
		expect(context.argPosition).toBe(1);
	});

	test("does not count flag values as arguments", () => {
		const context = parseCompletionContext("roadmap state create --status Done ", 34);
		expect(context.command).toBe("state");
		expect(context.subcommand).toBe("create");
		expect(context.argPosition).toBe(0);
	});
});
