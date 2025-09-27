---
id: task-281
title: Fix backlog init skip option
status: To Do
assignee:
  - '@codex'
created_date: '2025-09-27 16:32'
labels:
  - bug
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Summary
Selecting the "Do not add instructions" option during `backlog init` causes the wizard to show "Please select at least one agent instruction file before continuing." even though the user explicitly chose to skip agent instructions.

## Observed Behavior
1. Run `backlog init`.
2. Use the multiselect prompt to highlight "Do not add instructions (danger, this will make backlog not usable with ai agents)" and press enter to continue.
3. The CLI prints the validation error and the prompt restarts instead of accepting the skip decision.

## Expected Behavior
When the skip option is chosen, the wizard should accept the choice and proceed without creating agent instruction files.

## Notes
`processAgentSelection` treats a selection containing only "none" as invalid and forces a retry inside the interactive flow. The init command should treat that case as a valid decision and move forward.,
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Interactive backlog init accepts the skip option without showing a validation error.
- [ ] #2 Interactive backlog init still requires a retry when no option is chosen or when only the placeholder row is highlighted.
- [ ] #3 Automated coverage verifies that selecting only the skip option results in initialization continuing with zero agent instruction files.
<!-- AC:END -->
