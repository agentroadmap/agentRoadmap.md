---
id: task-273.06
title: '273.06: Web UI on centralized search'
status: To Do
assignee:
  - '@codex'
created_date: '2025-09-19 18:34'
updated_date: '2025-09-19 18:34'
labels:
  - web
  - search
  - ui
dependencies: []
parent_task_id: task-273
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Update the React app to consume search results from the new API/store, remove local Fuse usage, and add the search field plus status/priority dropdowns to the task list header with shared filter behavior and highlight links preserved.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Sidebar and task list load data via the centralized API/search service (no in-browser Fuse).
- [ ] #2 Task list header shows search input + two dropdowns (status, priority) wired to the shared search/filter API.
- [ ] #3 Existing highlight/deep-link flows keep working with the centralized results.
- [ ] #4 bun run check ., bunx tsc --noEmit, and bun test cover updated components.
<!-- AC:END -->
