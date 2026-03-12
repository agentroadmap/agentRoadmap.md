## State Finalization Guide

### Finalization Workflow

1. **Verify all acceptance criteria and Definition of Done items** - Confirm every checklist item is satisfied (use `state_view` to see current status; use `definitionOfDoneCheck/Uncheck` as needed)
2. **Run the Definition of Done checklist** (see below)
3. **Write the Final Summary** - Use `state_edit` (`finalSummary` field) to capture a PR-style summary of what changed and why. Avoid one-line summaries unless the change is trivial; include tests and key scope for reviewers.
4. **Confirm the implementation plan is captured and current** - Update the plan in Roadmap if the executed approach deviated
5. **Update state status** - Set status to "Done" via `state_edit`
6. **Propose next steps** - Never autonomously create or start new states

**Note:** States stay in "Done" status until periodic cleanup. Moving to the completed folder (`state_complete` or CLI cleanup) is a batch operation run occasionally, not part of finishing each state.

**Important:** Do not use `state_archive` for completed work. Archive is only for states that should not be completed (duplicate, canceled, invalid).

### Definition of Done Checklist

- Implementation plan exists in the state record (`state_edit` planSet/planAppend) and reflects the final solution
- Acceptance criteria are all checked via `state_edit` (acceptanceCriteriaCheck field)
- Definition of Done items are all checked via `state_edit` (definitionOfDoneCheck field)
- Automated and relevant manual tests pass; no new warnings or regressions introduced
- Documentation or configuration updates completed when required
- Implementation notes capture progress during work via `state_edit` (notesAppend field)
- Final Summary captures the PR-style completion summary via `state_edit` (`finalSummary` field). Include what changed, why, tests run, and any risks/follow-ups when relevant.
- Status transitions to "Done" via `state_edit`

### After Finalization

**Never autonomously create or start new states.** Instead:

- **If follow-up work is needed**: Present the idea to the user and ask whether to create a follow-up state
- **If this was a substate**:
  - Check if user explicitly told you to work on "parent state and all substates"
    - If YES: Proceed directly to the next substate without asking
    - If NO: Ask user: "Substate X is complete. Should I proceed with substate Y, or would you like to review first?"
- **If all substates in a series are complete**: Update parent state status if appropriate, then ask user what to do next

### Working with Substates

- When finalizing a substate, check all its acceptance criteria individually
- Update substate status to "Done" via `state_edit`
- Document substate-specific outcomes in the substate's notes
- Only update parent state status when ALL substates are complete (or when explicitly instructed)

### Implementation notes vs Final Summary

Implementation notes are for progress logging during execution (decisions, blockers, learnings). The Final Summary is for the PR-style completion summary when the state is done.

Use `state_edit` (notesAppend field) to record:
- Implementation decisions and rationale
- Blockers encountered and how they were resolved
- Technical debt or future improvements identified
- Testing approach and results

These notes help future developers (including AI agents) understand the context.
Do not repeat the same information that is clearly understandable from the code.

Use `state_edit` (`finalSummary`) to write a structured PR-style summary that highlights the key points of the implementation.
