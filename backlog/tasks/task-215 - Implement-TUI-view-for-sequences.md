---
id: task-215
title: Implement TUI view for sequences
status: To Do
assignee: []
created_date: '2025-07-27'
labels:
  - sequences
  - tui
  - ui
dependencies:
  - task-213
  - task-214
---

## Description

Create a dedicated TUI interface for visualising sequences so human users can intuitively see which tasks belong to which sequence. This enhances usability while keeping tasks and implementation details separate.

## Acceptance Criteria

- [ ] Add a new TUI screen (or reuse an existing layout) that displays sequences as vertical columns with tasks listed underneath each sequence number.
- [ ] The TUI should consume the sequences returned by the core compute function (Task 213) and not recalculate them.
- [ ] Users can navigate up/down between sequences and tasks using keyboard controls; there should be clear instructions for navigation.
- [ ] The layout must handle long task lists gracefully (e.g., by allowing scrolling) and should include IDs and titles for each task.
- [ ] Provide integration tests to ensure the TUI renders correctly and handles navigation without crashes.
