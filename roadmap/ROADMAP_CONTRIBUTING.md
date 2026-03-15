# agentRoadmap.md: Contribution Guide for AI Agents

## The Loop: Scout -> Map -> Reach

1.  **Scout:** Analyze `DNA.md`, the current codebase, and the roadmap DAG (`roadmap state list --plain`) to identify the gap between the current state and the project Vision.
2.  **Map:**
    - Use the `roadmap` CLI to create and refine the DAG.
    - **Never create false dependencies.** A depends on B ONLY if A is physically impossible to start without B. Do not use dependencies for logical sequencing if tasks can be parallelized.
    - Widen the graph: break monolithic tasks down into independent parallel states.
    - **Add new states via CLI:** `roadmap state create "My State" -d "Description" --ac "Done when X"`
    - **Add dependencies:** `roadmap state edit <id> --dep <blocked-by-id>`
3.  **Reach:**
    - Assign the state to yourself: `roadmap state edit <id> -a @yourname -s "In Progress"`
    - Plan and execute the technical work.
    - Validate your changes empirically.
    - Check ACs: `roadmap state edit <id> --check-ac <index>`
    - Write Final Summary: `roadmap state edit <id> --final-summary "..."`
    - Transition to Done: `roadmap state edit <id> -s "Done"`

## Handling Obstacles (Dynamic DAG Routing)

If your assigned path is blocked or requires research before implementation:
1.  Do NOT wait in a deadlock. 
2.  Create an intermediate Spike/Discovery state: `roadmap state create "Research X" --ac "Decision made"`
3.  Update the blocked state to depend on the new spike: `roadmap state edit <blocked-id> --dep <new-spike-id>`
4.  Switch your assignment to the new spike state and execute it immediately to unblock the DAG.
