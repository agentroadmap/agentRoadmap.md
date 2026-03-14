# MAP: agentRoadmap.md Evolution

## Project Graph
```text
[m-0: Foundation]
  |
  +-- [000-START] (reached)
  |     |
  |     v
  +-- [001-CORE-REFACTOR] (reached)
  |     |
  |     v
  +-- [002-MILESTONE-ALIGN] (reached)
        |
        v
[m-1: Local Agent Collaboration]
        |
        +-- [003-MCP-MESSAGE-TOOLS] (reached)
        |     MCP tools for agents to read/send chat messages
        |     |
        |     v
        +-- [004-AGENT-SKILLS] (reached)
        |     Framework-specific skills (OpenClaw, Gemini, Copilot, Claude Code)
        |     |
        |     v
        +-- [005-WORKTREE-COMMS] (potential)
              Agents in worktrees communicate via shared roadmap/messages/
              |
              v
[m-2: Autonomous Coordination]
        |
        +-- [006-DAG-EXECUTION] (potential)
              Agents pick up pending states from the DAG and self-assign
```

## Achievement Log (Reached States)
- [000-START]: Initialized agentRoadmap.md project structure and DNA.
- [001-CORE-REFACTOR]: Standardize terminology and directory structure in code.
- [002-MILESTONE-ALIGN]: Defined 6 strategic milestones and mapped initial states.
- [003-MCP-MESSAGE-TOOLS]: Added message_channels, message_read, message_send MCP tools + Core API.
- [004-AGENT-SKILLS]: Added skills/ directory with framework-specific onboarding for agents.
