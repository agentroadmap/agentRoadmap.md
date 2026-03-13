<h1 align="center">agentRoadmap.md</h1>
<p align="center">The Agent‑Native Strategic Map for Autonomous AI Project Management</p>

<p align="center">
<code>npm i -g agent-roadmap</code> or <code>bun add -g agent-roadmap</code>
</p>

---

> **agentRoadmap.md** is an agent-native project management framework. It redefines the traditional roadmap as a **Symbolic Map of States** optimized for autonomous AI agents. 
> Built for the fast-changing AI world where **Code is Truth** and **States are Locations** to be reached.

## 🗝️ Core Differentiators

* 🤖 **Agent-First:** Not a tool for humans to manage agents, but a tool for agents to manage themselves.
* 📍 **State-as-Location:** Replaces flat state lists with a recursive Directed Acyclic Graph (DAG) of project waypoints.
* 🗺️ **Symbolic Mapping:** Autonomous scouting and cartography of reachable project states.
* ⚡ **Proof of Arrival:** Every state is verified by terminal output or technical proof, not human sign-off.
* 🚀 **Continuous Promotion:** Built-in "Hype" layer for automatic agent-driven project broadcasting.

## 📂 Structure

- `/roadmap/DNA.md` -- Strategic guidance (Vision, Mission, Principles).
- `/roadmap/GLOSSARY.md` -- Strict project lexicon to prevent hallucinations.
- `/roadmap/MAP.md` -- The Symbolic Map of project states.
- `/roadmap/nodes/` -- Individual State files (Landmarks, States, Obstacles).

## 🛠️ Getting Started (For Agents)

The loop is simple: **Scout -> Map -> Reach**.

1. **Scout:** Analyze the DNA and codebase to find the next state.
2. **Map:** Create a new node and link it in the map graph.
3. **Reach:** Perform the work and provide "Proof of Arrival".

## 🤖 Multi-Agent Orchestration Pattern

For efficient local collaboration between multiple agents (e.g., a swarm on a single machine), we recommend the **Hierarchical Worktree Pattern**. This leverages Git's native isolation to prevent agents from stomping on each other while maintaining a shared strategic roadmap.

### The Architecture
```text
main (Shared Gateway)
 └── coordinator (orchestrator agent)
      ├── agent-1  → worktree /work/agent-1  (feature-auth)
      ├── agent-2  → worktree /work/agent-2  (feature-api)
      ├── agent-3  → worktree /work/agent-3  (feature-ui)
      └── tester   → worktree /work/tester   (reads all, merges to staging)
```

### Why It Works
*   **Isolation:** Agents work in clean sandboxes. Each worktree has its own working directory state.
*   **No Context Switching:** Agents don't need to stash/restore; their specific branch is always ready.
*   **True Parallelism:** Agents work simultaneously, sharing the object store but not the index.
*   **Clear Ownership:** Every output is auditable. You can diff exactly what an agent produced before merging.
*   **Total Visibility:** The Coordinator can run `git worktree list`, inspect any branch, and run cross-agent diffs instantly.

### The Tester / Coordinator Role
The **Tester Agent** acts as the quality gate:
1.  Pulls each agent's branch into a staging merge.
2.  Runs verification tests.
3.  Signals the **Coordinator** to merge to `main` if successful.
4.  Rejects and re-tasks the responsible agent if a branch fails.
5.  Handles merge conflicts as a dedicated responsibility (freeing up executors).

### Implementation Mapping
This pattern is ideal for:
*   **Claude Code / Gemini CLI:** Multiple instances, each in its own worktree.
*   **Agent Frameworks:** LangGraph, CrewAI, or any swarm where agents are long-running processes.
*   **Shared Gateway:** A local filesystem or server that all agents can access for real-time signaling.

### 👻 Ghost Identity Strategy & Agent Configuration
Running many agents on a single machine can lead to identity clashes. We use the **Ghost Identity Strategy**:
*   **System User (Shared):** All agents run under one OS user (e.g., your own login). No SSH/API key nightmares.
*   **Git User (Unique):** Each agent is given a unique Git identity via local worktree configuration (`git config user.name "Agent-UI"`). This preserves pure, auditable logs.
*   **Agent Configuration:**
    *   **Identity & Role:** Assigned per worktree (e.g., Coordinator, Tester, Feature-Developer).
    *   **Soul & Context:** Pre-loaded system prompts and DNA alignment specific to the agent's role.
    *   **Memory & Heartbeat:** Handled via the MCP Server (Gateway). The server acts as a shared memory hub and broadcasts heartbeat signals to synchronize state across agents.

### Rough Concerns to Plan For
*   **Merge Conflicts:** Agents working on overlapping files will create conflicts. The Coordinator needs a robust resolution strategy beyond simple merge commands.
*   **Long-running Agents:** Branches diverge over time. Periodic rebases onto `main` help but increase orchestration complexity.
*   **Shared Dependencies:** If multiple agents modify `package.json` or config files, conflicts are almost guaranteed.
*   **Worktree Cleanup:** Completed agent branches and worktrees need pruning to prevent storage accumulation.

---

*Forked from [roadmap.md](https://github.com/MrLesk/roadmap.md)*
