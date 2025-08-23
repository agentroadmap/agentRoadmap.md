---
id: task-214
title: Add CLI command to list sequences
status: To Do
assignee: []
created_date: '2025-07-27'
updated_date: '2025-08-23 19:11'
labels:
  - sequences
  - cli
dependencies:
  - task-213
---

## Description

Provide a command to inspect computed sequences. The command is interactive by default and supports --plain for machine-readable text output. It must reuse the core computation from task-213 and avoid duplicated logic.

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Introduce a \'backlog sequence list\' command; interactive by default; --plain outputs text
- [ ] #2 Plain output lists each sequence index and tasks as "task-<id> - <title>"
- [ ] #3 Reuse core compute function from task-213; do not duplicate logic in CLI
- [ ] #4 CLI help text explains usage and --plain flag
- [ ] #5 Tests verify plain output format
<!-- AC:END -->
