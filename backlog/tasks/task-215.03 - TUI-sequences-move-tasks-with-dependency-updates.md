---
id: task-215.03
title: 'TUI sequences: move tasks with dependency updates'
status: To Do
assignee: []
created_date: '2025-08-23 19:12'
labels:
  - sequences
dependencies: []
parent_task_id: task-215
---

## Description

Enable moving tasks within and between sequences and update dependencies accordingly to preserve execution order.

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Move within a sequence reorders without breaking sequences
- [ ] #2 Move between sequences updates dependencies to prior sequence tasks
- [ ] #3 Next sequence tasks depend on moved task when appropriate
<!-- AC:END -->
