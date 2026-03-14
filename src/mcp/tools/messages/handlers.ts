import { McpError } from "../../errors/mcp-errors.ts";
import type { McpServer } from "../../server.ts";
import type { CallToolResult } from "../../types.ts";

export type MessageChannelsArgs = Record<string, never>;

export type MessageReadArgs = {
	channel: string;
	since?: string;
};

export type MessageSendArgs = {
	from: string;
	message: string;
	channel?: string;
	to?: string;
};

export class MessageHandlers {
	constructor(private readonly core: McpServer) {}

	async listChannels(_args: MessageChannelsArgs): Promise<CallToolResult> {
		try {
			const channels = await this.core.listChannels();
			if (channels.length === 0) {
				return { content: [{ type: "text", text: "No message channels found. Start chatting with `roadmap talk <message>` to create one." }] };
			}
			const lines = channels.map((c) => `- **${c.name}** (${c.type})`).join("\n");
			return { content: [{ type: "text", text: `## Available Channels\n\n${lines}` }] };
		} catch (error) {
			throw new McpError(`Failed to list channels: ${(error as Error).message}`, "OPERATION_FAILED");
		}
	}

	async readMessages(args: MessageReadArgs): Promise<CallToolResult> {
		try {
			const result = await this.core.readMessages({ channel: args.channel, since: args.since });
			if (result.messages.length === 0) {
				const sinceNote = args.since ? ` since ${args.since}` : "";
				return { content: [{ type: "text", text: `No messages in **#${args.channel}**${sinceNote}.` }] };
			}
			const lines = result.messages.map((m) => `[${m.timestamp}] **${m.from}**: ${m.text}`).join("\n");
			return { content: [{ type: "text", text: `## #${args.channel}\n\n${lines}` }] };
		} catch (error) {
			throw new McpError(`Failed to read messages: ${(error as Error).message}`, "OPERATION_FAILED");
		}
	}

	async sendMessage(args: MessageSendArgs): Promise<CallToolResult> {
		try {
			let type: "public" | "group" | "private" = "group";
			let group: string | undefined;
			let to: string | undefined;

			if (args.to) {
				type = "private";
				to = args.to.replace(/^@/, "");
			} else if (args.channel === "public") {
				type = "public";
			} else {
				type = "group";
				group = args.channel ?? "project";
			}

			await this.core.sendMessage({ from: args.from, message: args.message, type, group, to });
			const dest = to ? `@${to}` : `#${group ?? "public"}`;
			return { content: [{ type: "text", text: `Message sent to ${dest}` }] };
		} catch (error) {
			throw new McpError(`Failed to send message: ${(error as Error).message}`, "OPERATION_FAILED");
		}
	}
}
