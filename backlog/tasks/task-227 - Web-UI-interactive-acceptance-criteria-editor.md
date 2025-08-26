---
id: task-227
title: 'Web UI: interactive acceptance criteria editor'
status: Done
assignee:
  - '@codex'
created_date: '2025-08-09 18:39'
updated_date: '2025-08-26 20:25'
labels:
  - web-ui
  - enhancement
dependencies:
  - task-226
---

## Description

In the web UI task popup, provide a dedicated, user-friendly interface for Acceptance Criteria: show them as an editable checklist with checkboxes, per-item add and remove controls, and immediate persistence to the task markdown. This enhances the user experience by making acceptance criteria management more intuitive and interactive.

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Acceptance criteria appear as an editable checklist in the web task popup
- [x] #2 Users can remove a single criterion from the UI without affecting others
- [x] #3 Users can toggle a criterion done/undone from the UI and it persists
- [x] #4 Markdown is updated using checkboxes without reformatting other sections
- [x] #5 Docs and tests updated for UI behaviors
<!-- AC:END -->

## Implementation Notes

Implemented interactive acceptance criteria editor in web UI

Implemented interactive Acceptance Criteria editor for web task popup with checklist controls, single-item removal, and toggle persistence. Wired editor into TaskForm, updated README docs, and added unit tests for AcceptanceCriteriaManager. All tests pass.
