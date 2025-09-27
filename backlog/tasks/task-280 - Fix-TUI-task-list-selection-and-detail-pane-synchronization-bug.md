---
id: task-280
title: Fix TUI task list selection and detail pane synchronization bug
status: To Do
assignee: []
created_date: '2025-09-27 13:54'
labels:
  - bug
  - tui
dependencies: []
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The TUI task list has an off-by-one error where the selected task and detail pane are not synchronized. When navigating with arrow keys, the detail pane shows the previous task instead of the currently highlighted one. Additionally, when opening with filters (e.g., -s 'To Do'), the initial selection is in the middle of the list instead of the first item.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Task detail pane shows the correct task when navigating with up/down arrows
- [ ] #2 Initial selection is on the first task when opening with filters
- [ ] #3 Selection and detail remain synchronized during filter changes
- [ ] #4 Task list properly handles cases where previously selected task is not in filtered results
- [ ] #5 Detail pane updates immediately when selection changes, not one step behind
<!-- AC:END -->
