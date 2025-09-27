---
id: task-276
title: Implement drag mode for TUI kanban board
status: To Do
assignee: []
created_date: '2025-09-26 19:07'
labels: []
dependencies:
  - task-262
  - task-275
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Add drag-and-drop functionality to the TUI kanban board using Shift+Arrow keys. When holding Shift, the board enters drag mode where the selected task becomes visually highlighted with a special indicator (e.g., different background color, border). In drag mode, arrow keys move the task: Up/Down moves within the same column triggering ordinal changes, Left/Right moves between status columns. The UI should clearly indicate drag mode is active with visual feedback like a status line or border change. This provides keyboard-based task reordering similar to the web UI's mouse drag-and-drop.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Add drag mode state management to board.ts
- [ ] #2 Implement Shift key detection to toggle drag mode on/off
- [ ] #3 Create visual indicators for drag mode (enhanced highlight, status line)
- [ ] #4 Handle Up/Down arrows in drag mode to reorder within column
- [ ] #5 Handle Left/Right arrows in drag mode to move between status columns
- [ ] #6 Show drop position indicator when moving tasks
- [ ] #7 Call core reordering methods when dropping task in new position
- [ ] #8 Add escape key to cancel drag operation
- [ ] #9 Update help text to include new Shift+Arrow controls
<!-- AC:END -->
