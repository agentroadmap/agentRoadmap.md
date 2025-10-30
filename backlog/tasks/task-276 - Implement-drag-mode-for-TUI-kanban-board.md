---
id: task-276
title: Implement drag mode for TUI kanban board
status: To Do
assignee: []
created_date: '2025-09-26 19:07'
updated_date: '2025-10-30 22:02'
labels: []
dependencies:
  - task-262
  - task-275
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Add drag-and-drop functionality to the TUI kanban board using the 'm' key as a toggle. Press 'm' to enter drag mode where the selected task becomes visually highlighted with a special indicator (e.g., magenta border). In drag mode, arrow keys move the task: Up/Down moves within the same column triggering ordinal changes, Left/Right moves between status columns. Press 'm' again or Escape to exit drag mode. The UI should clearly indicate drag mode is active with visual feedback like border color change and status line update. This provides keyboard-based task reordering similar to the web UI's mouse drag-and-drop.

Note: Detecting modifier keys (Shift/Ctrl/Alt) pressed alone is not possible in standard terminals due to how terminal I/O works. Terminals only send data when a printable key or key combination is pressed. Using a toggle key provides a better UX without terminal limitations.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Add drag mode state management to board.ts
- [ ] #2 Implement 'm' key to toggle drag mode on/off
- [ ] #3 Change column border to magenta when entering drag mode
- [ ] #4 Add enhanced visual highlight to the currently selected task in drag mode (e.g., different background color, bold text)
- [ ] #5 Handle Up/Down arrows in drag mode to reorder within column
- [ ] #6 Handle Left/Right arrows in drag mode to move between status columns
- [ ] #7 Update visual state when entering/exiting drag mode (restore normal colors)
- [ ] #8 Call core reordering methods when moving tasks
- [ ] #9 Add escape key to exit drag mode and restore normal visual state

- [ ] #10 Update help text to include new drag mode controls (m + arrows)
<!-- AC:END -->
