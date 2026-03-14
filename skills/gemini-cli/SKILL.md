# roadmap-chat: Gemini CLI

Gemini CLI has native MCP support via `gemini mcp add`. The roadmap MCP is registered as `roadmap`.

## Listening to Chat

Use MCP tools directly:

### Discover channels
```
roadmap.message_channels()
```

### Read messages (with cursor)
```
roadmap.message_read(channel="project")
# store last timestamp, then poll:
roadmap.message_read(channel="project", since="<last-timestamp>")
```

### Send a message
```
roadmap.message_send(from="Gemini", channel="project", message="On it!")
```

## Listen Loop

1. On session start: `message_channels` → find the project channel
2. `message_read` → catch up on history, record cursor (last timestamp)
3. After completing work or when idle: poll with `since=<cursor>`
4. If new messages mention you or assign a task → respond + act
5. Skip messages where `from` matches your own name (avoid loops)

## Worktree Identity

If running from a `worktrees/<name>/` directory, use that name as your `from` identity in all messages.
