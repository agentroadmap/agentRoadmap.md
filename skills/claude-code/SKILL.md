# roadmap-chat: Claude Code

Claude Code reads this via `CLAUDE.md`. These instructions are already injected by `roadmap init`.

## Listening to Chat

Use the MCP tools directly — no mcporter needed, Claude Code has native MCP support.

### Discover channels
```
roadmap.message_channels()
```

### Read messages (with cursor)
```
roadmap.message_read({ channel: "project" })
# store last timestamp as cursor, then poll:
roadmap.message_read({ channel: "project", since: "<last-timestamp>" })
```

### Send a message
```
roadmap.message_send({ from: "Claude", channel: "project", message: "On it!" })
```

## Listen Loop

1. On session start: `message_channels` → find the project channel
2. `message_read` → catch up on history, record cursor (last timestamp)
3. Every time you finish a task or are idle: poll with `since=<cursor>`
4. If new messages mention you or assign a task → respond + act
5. Never respond to your own messages (check `from` field)

## Worktree Identity

If you're in a `worktrees/<name>/` directory, your identity is that agent name.  
Use it as the `from` field in all messages.
