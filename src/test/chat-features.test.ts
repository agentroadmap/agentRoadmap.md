import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { spawn } from "node:child_process";
import { mkdir, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { $ } from "bun";
import { Core } from "../index.ts";
import { formatLocalDateTime } from "../utils/date-time.ts";
import { createUniqueTestDir, safeCleanup, sleep } from "./test-utils.ts";

const CLI_PATH = join(process.cwd(), "src", "cli.ts");

let TEST_DIR: string;
let core: Core;

async function waitFor(condition: () => boolean | Promise<boolean>, timeoutMs = 4000): Promise<void> {
	const startedAt = Date.now();
	while (Date.now() - startedAt < timeoutMs) {
		if (await condition()) return;
		await sleep(50);
	}
	throw new Error(`Timed out after ${timeoutMs}ms`);
}

function captureStream(stream: NodeJS.ReadableStream | null | undefined): Promise<string> {
	return new Promise((resolve) => {
		if (!stream) {
			resolve("");
			return;
		}

		let output = "";
		stream.setEncoding?.("utf8");
		stream.on("data", (chunk) => {
			output += String(chunk);
		});
		stream.on("end", () => resolve(output));
		stream.on("close", () => resolve(output));
	});
}

function groupLogPath(group = "chat-test") {
	return join(TEST_DIR, "roadmap", "messages", `group-${group}.md`);
}

function privateLogPath(left: string, right: string) {
	return join(TEST_DIR, "roadmap", "messages", `private-${[left, right].sort().join("-")}.md`);
}

describe("chat features", () => {
	beforeEach(async () => {
		TEST_DIR = createUniqueTestDir("chat-features");
		await rm(TEST_DIR, { recursive: true, force: true }).catch(() => {});
		await mkdir(TEST_DIR, { recursive: true });
		await $`git init -b main`.cwd(TEST_DIR).quiet();
		await $`git config user.name "Gary"`.cwd(TEST_DIR).quiet();
		await $`git config user.email "gary@example.com"`.cwd(TEST_DIR).quiet();

		core = new Core(TEST_DIR);
		await core.initializeProject("Chat Test");
	});

	afterEach(async () => {
		await safeCleanup(TEST_DIR).catch(() => {});
	});

	it("preserves multiline talk content and extracts mentions when reading messages", async () => {
		const beforeSendMinute = formatLocalDateTime(new Date());
		await core.sendMessage({
			from: "Gary",
			message: "Line one\nLine two for @bob",
			type: "group",
			group: "chat-test",
		});
		const afterSendMinute = formatLocalDateTime(new Date());

		const result = await core.readMessages({ channel: "chat-test" });
		expect(result.messages).toHaveLength(1);
		expect(result.messages[0]).toMatchObject({
			from: "Gary",
			text: "Line one\nLine two for @bob",
			mentions: ["bob"],
		});
		expect([beforeSendMinute, afterSendMinute]).toContain(result.messages[0]?.timestamp.slice(0, 16));

		const raw = await readFile(groupLogPath(), "utf8");
		expect(raw).toContain("__roadmap_msg_b64__:");
	});

	it("collects known users from worktrees and message history", async () => {
		await mkdir(join(TEST_DIR, "worktrees", "andy"), { recursive: true });
		await mkdir(join(TEST_DIR, "worktrees", "bob"), { recursive: true });
		await core.sendMessage({
			from: "Gary",
			message: "Hello @andy",
			type: "group",
			group: "chat-test",
		});

		const users = await core.getKnownUsers();
		expect(users).toEqual(expect.arrayContaining(["Gary", "andy", "bob"]));
	});

	it("replays and streams mention-filtered messages", async () => {
		await core.sendMessage({
			from: "Gary",
			message: "General hello",
			type: "group",
			group: "chat-test",
		});
		await core.sendMessage({
			from: "Gary",
			message: "Checking in with @bob",
			type: "group",
			group: "chat-test",
		});

		const seen: string[] = [];
		const stopWatching = await core.watchMessages({
			channel: "chat-test",
			since: "2000-01-01 00:00:00",
			mention: "bob",
			onMessage: (message) => {
				seen.push(message.text);
			},
		});

		await waitFor(() => seen.length === 1);
		expect(seen).toEqual(["Checking in with @bob"]);

		await core.sendMessage({
			from: "Carter",
			message: "No mention here",
			type: "group",
			group: "chat-test",
		});
		await core.sendMessage({
			from: "Carter",
			message: "Following up for @bob",
			type: "group",
			group: "chat-test",
		});

		await waitFor(() => seen.length === 2);
		expect(seen).toEqual(["Checking in with @bob", "Following up for @bob"]);
		stopWatching();
	});

	it("routes talk messages to group and private logs", async () => {
		await $`bun ${CLI_PATH} talk ${"Hello @bob"} --as ${"Gary"}`.cwd(TEST_DIR).quiet();
		await $`bun ${CLI_PATH} talk ${"Private hello"} ${"@bob"} --as ${"Gary"}`.cwd(TEST_DIR).quiet();

		const groupMessages = await core.readMessages({ channel: "chat-test" });
		expect(groupMessages.messages.at(-1)).toMatchObject({
			from: "Gary",
			text: "Hello @bob",
			mentions: ["bob"],
		});

		const privateLog = await readFile(privateLogPath("gary", "bob"), "utf8");
		expect(privateLog).toContain("Private hello");
	});

	it("renders mention-filtered listen output in markdown mode", async () => {
		await core.sendMessage({
			from: "Gary",
			message: "Hello @bob from markdown mode",
			type: "group",
			group: "chat-test",
		});

		const child = spawn(
			"bun",
			[CLI_PATH, "listen", "chat-test", "--mention", "bob", "--since", "2000-01-01 00:00:00", "--all", "--markdown"],
			{
				cwd: TEST_DIR,
				stdio: ["ignore", "pipe", "pipe"],
			},
		);
		const stdoutPromise = captureStream(child.stdout);
		await sleep(500);
		child.kill("SIGTERM");
		await new Promise((resolve) => child.on("exit", resolve));
		const stdout = await stdoutPromise;

		expect(stdout).toContain("**Gary**");
		expect(stdout).toContain("**@bob**");
		expect(stdout).toContain("Hello **@bob** from markdown mode");
	});

	it("renders compact listen output without blank lines between messages", async () => {
		await core.sendMessage({
			from: "Gary",
			message: "First compact message",
			type: "group",
			group: "chat-test",
		});
		await core.sendMessage({
			from: "Carter",
			message: "Second compact message",
			type: "group",
			group: "chat-test",
		});

		const child = spawn(
			"bun",
			[CLI_PATH, "listen", "chat-test", "--since", "2000-01-01 00:00:00", "--all", "--markdown"],
			{
				cwd: TEST_DIR,
				stdio: ["ignore", "pipe", "pipe"],
			},
		);
		const stdoutPromise = captureStream(child.stdout);
		await sleep(500);
		child.kill("SIGTERM");
		await new Promise((resolve) => child.on("exit", resolve));
		const stdout = await stdoutPromise;

		expect(stdout).toContain("First compact message\n**Carter**");
		expect(stdout).not.toContain("First compact message\n\n**Carter**");
	});

	it("shows revision in splash and sends chat input lines", async () => {
		const splash = await $`bun ${CLI_PATH} --plain`.cwd(TEST_DIR).quiet();
		expect(splash.stdout.toString()).toContain("rev ");

		const child = spawn("bun", [CLI_PATH, "chat"], {
			cwd: TEST_DIR,
			stdio: ["pipe", "pipe", "pipe"],
		});
		const stdoutPromise = captureStream(child.stdout);

		await sleep(300);
		child.stdin?.write("hello from non-tty chat\n");

		await waitFor(async () => {
			const content = await readFile(groupLogPath(), "utf8").catch(() => "");
			return content.includes("hello from non-tty chat");
		});

		child.kill("SIGTERM");
		await new Promise((resolve) => child.on("exit", resolve));
		const stdout = await stdoutPromise;
		expect(stdout).toContain("rev ");
	});
});
