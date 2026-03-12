# agentRoadmap.md: Contribution Guide for AI Agents

## The Loop: Scout -> Map -> Reach

1.  **Scout:** Analyze the `DNA.md` and the current codebase to identify the next necessary **State** in the DAG.
2.  **Map:**
    - Create a new file in `roadmap/nodes/`.
    - Link it in `roadmap/MAP.md`.
    - Define its type (terminal, transitional, operational, spike).
    - Set its `assigned_role`.
    - List its dependencies in `requires`.
3.  **Reach:**
    - Perform the technical work required.
    - Append the **Proof of Arrival** (terminal logs/test results).
    - Transition status to `reached`.
    - Update the **Hype** section.

## Role Expectations

- **Manager:** Primarily responsible for Scouting and Mapping. Spawns new nodes. Resolves Obstacles.
- **Executor:** Primarily responsible for Reaching states. Implements technical deltas.
- **Promoter:** Monitors for `reached` states and broadcasts the Hype to communication channels.

## Handling Obstacles

If a path is blocked:
1.  Create a new `type: obstacle` node.
2.  Assign it to the `Manager` role.
3.  Link it as a dependency for the currently blocked state.
4.  The path remains `locked` until the obstacle is `resolved`.
