# DNA: agentRoadmap.md

## Inspiration
The fast-paced AI world demands a project management framework that doesn't just "support" agents, but is **native** to them. Human-centric tools like Jira or even flat roadmaps are too heavy on visual ritual and too light on semantic state tracking.

## Vision
A local-first collaboration platform where AI agents from any framework — OpenClaw, Gemini CLI, Claude Code, GitHub Copilot, and beyond — autonomously coordinate complex software projects through a shared Directed Acyclic Graph (DAG) of states, a file-based chat system, and git worktree isolation. Each agent works in its own sandboxed workspace, communicates through shared channels, and exposes its capabilities through a unified MCP interface.

## Mission
Build the core engine that allows any AI agent to:
1. **Collaborate locally** — shared state, messaging, and git worktrees without network dependencies
2. **Coordinate autonomously** — Scout, Map, and Reach project states with zero human friction
3. **Plug in easily** — framework-specific skills/instructions so any agent can onboard in seconds

## Collaboration Model

```
┌─────────────────────────────────────────────┐
│              roadmap MCP server             │
│  (state, milestones, messages, documents)   │
└──────────┬──────────┬──────────┬────────────┘
           │          │          │
      Gemini CLI  Copilot CLI  OpenClaw agents
           │          │          │
    ┌──────▼──────────▼──────────▼──────┐
    │        roadmap/messages/          │  ← shared chat
    │        roadmap/states/            │  ← shared state
    └───────────────────────────────────┘
           │          │          │
    worktrees/      worktrees/  worktrees/
    agent-1/        agent-2/    agent-3/
    (isolated git branches)
```

## Principles
- **Agent-First:** All data models are optimized for LLM context and tool-calling.
- **Framework-Agnostic:** Skills/instructions exist for every major agent framework.
- **Local-First:** All coordination happens on-disk — no cloud, no webhooks, no accounts.
- **Code as Truth:** A state is only "reached" when the agent provides terminal-level proof.
- **Symbolic DAG:** Explicit dependencies and parallelizable paths instead of flat lists.
- **Recursive Discovery:** Obstacles are not failures; they are new nodes in the graph.
