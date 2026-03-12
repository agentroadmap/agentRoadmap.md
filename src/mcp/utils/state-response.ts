import { formatStatePlainText } from "../../formatters/state-plain-text.ts";
import type { State } from "../../types/index.ts";
import type { CallToolResult } from "../types.ts";

export async function formatStateCallResult(
	state: State,
	summaryLines: string[] = [],
	options: Parameters<typeof formatStatePlainText>[1] = {},
): Promise<CallToolResult> {
	const formattedState = formatStatePlainText(state, options);
	const summary = summaryLines.filter((line) => line.trim().length > 0).join("\n");
	const text = summary ? `${summary}\n\n${formattedState}` : formattedState;

	return {
		content: [
			{
				type: "text",
				text,
			},
		],
	};
}
