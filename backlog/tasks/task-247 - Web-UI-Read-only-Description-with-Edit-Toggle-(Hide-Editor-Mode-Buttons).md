---
id: task-247
title: Web UI - Read-only Description with Edit Toggle (Hide Editor Mode Buttons)
status: To Do
assignee: []
created_date: '2025-09-02 20:19'
updated_date: '2025-09-02 20:47'
labels:
  - web-ui
  - editor
  - ux
dependencies: []
priority: medium
---

## Description

Make the task Description in the Web UI read-only by default with a single explicit 'Edit' button to enter edit mode. Hide the markdown editor's internal view/edit toggles to avoid duplicate controls. When in edit mode, show a 'Save' button (only then) and a 'Cancel' to revert and return to read-only. Keep the rest of the form unchanged; this task focuses only on the Description section control UX.

Also increase the Task Viewer popup size so that more of the Description content fits by default on desktop while remaining responsive on smaller screens. Avoid horizontal overflow; keep the dialog centered and usable.

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 On opening an existing task in the web UI, the Description section renders in read-only preview (no caret or textarea), and no editor-internal view/edit controls are visible.
- [ ] #2 An 'Edit' button is visible beside the Description header; clicking it switches the Description to edit mode, hides the 'Edit' button, and shows 'Save' and 'Cancel'.
- [ ] #3 The 'Save' button appears only in edit mode and is disabled until the content changes; clicking 'Save' persists the Description and returns to read-only with the 'Edit' button visible again.
- [ ] #4 Clicking 'Cancel' discards any unsaved Description changes and returns to read-only without saving.
- [ ] #5 The markdown editor’s own toolbar or mode switch is hidden in both states; only our custom controls are shown.
- [ ] #6 No layout jump or flicker occurs when toggling modes; height remains stable across light/dark themes.
- [ ] #7 Task Viewer: On desktop, the popup shows more description by default (wider/taller) without horizontal overflow; remains centered and scrolls vertically as needed.
- [ ] #8 Task Viewer: Responsive on small screens with no clipping; primary controls (close/save/cancel) remain visible without overlapping or off-screen.
<!-- AC:END -->
