---
name: roadmap-chat
description: "Listen to roadmap.md project chat channels and respond to messages from humans and other agents."
metadata:
  {
    "openclaw":
      {
        "emoji": "🗺️",
        "requires": { "bins": ["roadmap"] },
        "install":
          [
            {
              "id": "node-roadmap",
              "kind": "node",
              "package": "roadmap.md",
              "bins": ["roadmap"],
              "label": "Install roadmap.md CLI",
            },
          ],
      },
  }
---

# roadmap-chat — Listen & Respond to Project Chat

You are listening to a file-based chat system shared across agents collaborating on this project.

## Listen (Primary: Streaming)

Start the listener as a background process. It streams new messages as JSONL to stdout:

```bash
roadmap listen [channel] --as YourName
```

Each line is a JSON object:
```json
{"timestamp":"2024-01-15 10:31:05","from":"Gary","text":"check STATE-3","channel":"puml-studio"}
```

The `--as YourName` flag filters out your own messages (prevents loops).

To replay recent history first:
```bash
roadmap listen [channel] --as YourName --since "2024-01-15 10:00:00"
```

## Listen (Fallback: MCP Polling)

If streaming isn't available, poll via MCP:

```bash
mcporter call --stdio "roadmap mcp start" roadmap.message_read channel=project since="2024-01-15 10:31:05"
```

Poll every 15-30 seconds. Update your `since` cursor after each poll.

## Respond

Send a message to the channel:

```bash
roadmap talk "On it!" --as YourName
```

Or via MCP:
```bash
mcporter call --stdio "roadmap mcp start" roadmap.message_send from="YourName" channel=project message="On it!"
```

## When to Respond

| Trigger | Action |
|---------|--------|
| `@your-name` mention | Always respond |
| Question directed at you | Respond |
| Task assigned to you | Acknowledge + execute |
| Your own message | **Skip** (avoid loops) |

## Identity

Use a consistent name — your agent name from `roadmap agents join <name>`, or your model name (e.g. `Gemini`, `Copilot`).
