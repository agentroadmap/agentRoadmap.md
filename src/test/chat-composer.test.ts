import { describe, expect, it } from "bun:test";
import {
	acceptChatMention,
	applyChatComposerKey,
	completeChatMention,
	completeChatPath,
	createChatComposerState,
	cycleChatMention,
	getChatComposerText,
	getChatMentionSuggestions,
	renderChatComposerLines,
} from "../utils/chat-composer.ts";

describe("chat composer", () => {
	it("sends the draft on bare Enter", () => {
		let state = createChatComposerState();
		state = applyChatComposerKey(state, { sequence: "h" }, "h").state;
		state = applyChatComposerKey(state, { sequence: "i" }, "i").state;

		const result = applyChatComposerKey(state, { name: "return", sequence: "\r" }, "\r");
		expect(result.type).toBe("send");
		if (result.type !== "send") throw new Error("expected send result");
		expect(result.message).toBe("hi");
		expect(getChatComposerText(result.state)).toBe("");
	});

	it("adds a newline on Shift+Enter", () => {
		let state = createChatComposerState();
		state = applyChatComposerKey(state, { sequence: "a" }, "a").state;
		state = applyChatComposerKey(state, { name: "return", shift: true, sequence: "\r" }, "\r").state;
		state = applyChatComposerKey(state, { sequence: "b" }, "b").state;

		expect(getChatComposerText(state)).toBe("a\nb");
		expect(renderChatComposerLines(state)).toEqual(["> a", "| b"]);
	});

	it("adds a newline on Alt+Enter", () => {
		let state = createChatComposerState();
		state = applyChatComposerKey(state, { sequence: "a" }, "a").state;
		state = applyChatComposerKey(state, { name: "return", meta: true, sequence: "\u001b\r" }, "\u001b\r").state;
		state = applyChatComposerKey(state, { sequence: "b" }, "b").state;

		expect(getChatComposerText(state)).toBe("a\nb");
	});

	it("backspace merges lines when the current line is empty", () => {
		let state = createChatComposerState();
		state = applyChatComposerKey(state, { sequence: "a" }, "a").state;
		state = applyChatComposerKey(state, { name: "return", shift: true, sequence: "\r" }, "\r").state;

		const result = applyChatComposerKey(state, { name: "backspace", sequence: "\b" }, "\b");
		expect(getChatComposerText(result.state)).toBe("a");
	});

	it("completes @mentions from known users", () => {
		let state = createChatComposerState();
		for (const char of "hey @bo") {
			state = applyChatComposerKey(state, { sequence: char }, char).state;
		}

		state = completeChatMention(state, ["bob", "carter"]);
		expect(getChatComposerText(state)).toBe("hey @bob");
	});

	it("returns live @mention suggestions while typing", () => {
		let state = createChatComposerState();
		for (const char of "hello @b") {
			state = applyChatComposerKey(state, { sequence: char }, char).state;
		}

		expect(getChatMentionSuggestions(state, ["carter", "bob", "bobby"])).toEqual([
			{ value: "@bob", selected: true },
			{ value: "@bobby", selected: false },
		]);
	});

	it("cycles mention suggestions across all matches", () => {
		let state = createChatComposerState();
		for (const char of "hello @b") {
			state = applyChatComposerKey(state, { sequence: char }, char).state;
		}

		state = cycleChatMention(state, ["bobby", "ben", "bob"], 1);
		expect(getChatComposerText(state)).toBe("hello @ben");

		state = cycleChatMention(state, ["bobby", "ben", "bob"], 1);
		expect(getChatComposerText(state)).toBe("hello @bob");

		state = cycleChatMention(state, ["bobby", "ben", "bob"], 1);
		expect(getChatComposerText(state)).toBe("hello @bobby");
	});

	it("cycles mention suggestions backwards", () => {
		let state = createChatComposerState();
		for (const char of "hello @b") {
			state = applyChatComposerKey(state, { sequence: char }, char).state;
		}

		state = cycleChatMention(state, ["bobby", "ben", "bob"], -1);
		expect(getChatComposerText(state)).toBe("hello @bobby");
	});

	it("accepts the selected mention before sending", () => {
		let state = createChatComposerState();
		for (const char of "hello @b") {
			state = applyChatComposerKey(state, { sequence: char }, char).state;
		}

		state = acceptChatMention(state, ["bob", "bobby"]);
		expect(getChatComposerText(state)).toBe("hello @bob ");

		const result = applyChatComposerKey(state, { name: "return", sequence: "\r" }, "\r");
		expect(result.type).toBe("send");
		if (result.type !== "send") throw new Error("expected send result");
		expect(result.message).toBe("hello @bob");
	});

	it("lets backspace keep editing after selecting a mention", () => {
		let state = createChatComposerState();
		for (const char of "hello @b") {
			state = applyChatComposerKey(state, { sequence: char }, char).state;
		}

		state = cycleChatMention(state, ["bob", "bobby"], 1);
		expect(getChatComposerText(state)).toBe("hello @bob");

		state = applyChatComposerKey(state, { name: "backspace", sequence: "\b" }, "\b").state;
		expect(getChatComposerText(state)).toBe("hello @bo");
		expect(getChatMentionSuggestions(state, ["bob", "bobby"])).toEqual([
			{ value: "@bob", selected: true },
			{ value: "@bobby", selected: false },
		]);
	});

	it("normalizes raw user names into mentionable handles", () => {
		let state = createChatComposerState();
		for (const char of "hello @g") {
			state = applyChatComposerKey(state, { sequence: char }, char).state;
		}

		expect(getChatMentionSuggestions(state, ["Gemini CLI", "Gary", "Gary (Human)"])).toEqual([
			{ value: "@gary", selected: true },
			{ value: "@gemini-cli", selected: false },
		]);
	});

	it("completes ~/ paths with a directory suffix", () => {
		let state = createChatComposerState();
		for (const char of "open ~/Doc") {
			state = applyChatComposerKey(state, { sequence: char }, char).state;
		}

		state = completeChatPath(state, {
			homeDir: "/home/tester",
			listDirectory: (directory) => {
				expect(directory).toBe("/home/tester");
				return [{ name: "Documents", isDirectory: true }];
			},
		});

		expect(getChatComposerText(state)).toBe("open ~/Documents/");
	});

	it("completes absolute paths", () => {
		let state = createChatComposerState();
		for (const char of "check /usr/loc") {
			state = applyChatComposerKey(state, { sequence: char }, char).state;
		}

		state = completeChatPath(state, {
			listDirectory: (directory) => {
				expect(directory).toBe("/usr");
				return [{ name: "local", isDirectory: true }];
			},
		});

		expect(getChatComposerText(state)).toBe("check /usr/local/");
	});

	it("extends to the shared prefix when multiple path matches exist", () => {
		let state = createChatComposerState();
		for (const char of "browse ~/Do") {
			state = applyChatComposerKey(state, { sequence: char }, char).state;
		}

		state = completeChatPath(state, {
			homeDir: "/home/tester",
			listDirectory: () => [
				{ name: "Docs", isDirectory: true },
				{ name: "Documents", isDirectory: true },
			],
		});

		expect(getChatComposerText(state)).toBe("browse ~/Doc");
	});

	it("leaves the draft unchanged when no path matches exist", () => {
		let state = createChatComposerState();
		for (const char of "open /missing") {
			state = applyChatComposerKey(state, { sequence: char }, char).state;
		}

		const nextState = completeChatPath(state, {
			listDirectory: () => [],
		});

		expect(getChatComposerText(nextState)).toBe("open /missing");
	});

	it("ignores arrow-key escape sequences in the draft", () => {
		let state = createChatComposerState();
		for (const char of "hello") {
			state = applyChatComposerKey(state, { sequence: char }, char).state;
		}

		const nextState = applyChatComposerKey(state, { name: "right", sequence: "\u001b[C" }, "\u001b[C").state;
		expect(getChatComposerText(nextState)).toBe("hello");
	});
});
