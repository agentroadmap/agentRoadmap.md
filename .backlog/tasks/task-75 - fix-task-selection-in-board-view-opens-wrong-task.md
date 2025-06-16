---
id: task-75
title: Fix task selection in board view - opens wrong task
status: To Do
assignee: []
created_date: '2025-06-16'
updated_date: '2025-06-16'
labels:
  - bug
  - ui
  - board
dependencies: []
---

## Description

The board view has a bug where clicking on a task sometimes opens the wrong task. This issue affects user navigation and needs to be fixed to ensure proper task selection behavior.

The problem appears to be intermittent, suggesting it might be related to:
- State management issues
- Event handling conflicts
- Indexing problems in the board layout
- Race conditions in the selection logic

## Acceptance Criteria

- [ ] Clicking on any task in the board view always opens the correct task
- [ ] Task selection is consistent across all board columns
- [ ] No race conditions or state conflicts when rapidly clicking tasks
- [ ] Selection works correctly after board updates/refreshes
- [ ] Test coverage added for task selection logic
