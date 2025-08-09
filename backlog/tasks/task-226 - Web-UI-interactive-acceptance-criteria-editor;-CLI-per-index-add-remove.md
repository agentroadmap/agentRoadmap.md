---
id: task-226
title: 'Web UI: interactive acceptance criteria editor; CLI: per-index add/remove'
status: To Do
assignee: []
created_date: '2025-08-08 22:30'
labels:
  - web-ui
  - cli
  - enhancement
dependencies: []
priority: medium
---

## Description

In the web UI task popup, provide a dedicated, user-friendly interface for Acceptance Criteria: show them as an editable checklist with checkboxes, per-item add and remove controls, and immediate persistence to the task markdown. Additionally, extend the CLI to support adding and removing a single acceptance criterion by its index to enable granular automation (e.g., CI pipelines) without rewriting the entire section.

## Acceptance Criteria

- [ ] Acceptance criteria appear as an editable checklist in the web task popup
- [ ] Users can add a single criterion from the UI without replacing existing ones
- [ ] Users can remove a single criterion from the UI without affecting others
- [ ] Users can toggle a criterion done/undone from the UI and it persists
- [ ] Markdown is updated using "- [ ]" and "- [x]" without reformatting other sections
- [ ] CLI supports adding a single acceptance criterion by index
- [ ] CLI supports removing a single acceptance criterion by index
- [ ] Invalid indexes return clear errors and a non-zero exit code
- [ ] Docs and tests updated for UI and CLI behaviors
