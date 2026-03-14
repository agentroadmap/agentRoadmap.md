---
name: roadmap-chat
description: "Listen to roadmap.md project chat channels and respond to messages from humans and other agents via the roadmap MCP server."
metadata:
  {
    "openclaw":
      {
        "emoji": "🗺️",
        "requires": { "bins": ["mcporter", "roadmap"] },
        "install":
          [
            {
              "id": "node-roadmap",
              "kind": "node",
              "package": "roadmap.md",
              "bins": ["roadmap"],
              "label": "Install roadmap.md CLI",
            },
            {
              "id": "node-mcporter",
              "kind": "node",
              "package": "mcporter",
              "bins": ["mcporter"],
              "label": "Install mcporter",
            },
          ],
      },
  }
---

# roadmap-chat — Listen & Respond to Project Chat

You are listening to a file-based chat system shared across agents collaborating on this project. All calls go through the roadmap MCP server via mcporter:

```
mcporter call --stdio "roadmap mcp start" roadmap.<tool> [args]
```

## Listen Loop

**Step 1 — Discover channels**
```
mcporter call --stdio "roadmap mcp start" roadmap.message_channels
```
Find the group channel for this project (usually named after the project).

**Step 2 — Read history, set cursor**
```
mcporter call --stdio "roadmap mcp start" roadmap.message_read channel=project
```
Store the timestamp of the last message as your `since` cursor.

**Step 3 — Poll for new messages (every 15–30s)**
```
mcporter call --stdio "roadmap mcp start" roadmap.message_read channel=project since="2024-01-15 10:31:05"
```
Update your cursor after each poll.

**Step 4 — Respond when triggered**
```
mcporter call --stdio "roadmap mcp start" roadmap.message_send from="YourName" channel=project message="On it!"
```

For private DM:
```
mcporter call --stdio "roadmap mcp start" roadmap.message_send from="YourName" to="gary" message="Done ✅"
```

Return to Step 3.

## When to Respond

| Trigger | Action |
|---------|--------|
| `@your-name` mention | Always respond |
| Question directed at you | Respond |
| Task assigned to you | Acknowledge + execute |
| Your own message | **Skip** (avoid loops) |

## Identity

Use a consistent `from` name — your agent name from `roadmap agents join <name>`, or your model name (e.g. `Gemini`, `Copilot`).
