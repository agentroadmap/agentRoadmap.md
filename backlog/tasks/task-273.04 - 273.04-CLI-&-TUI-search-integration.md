---
id: task-273.04
title: '273.04: CLI & TUI search integration'
status: To Do
assignee:
  - '@codex'
created_date: '2025-09-19 18:33'
updated_date: '2025-09-19 18:34'
labels:
  - cli
  - tui
  - search
dependencies: []
parent_task_id: task-273
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Route the CLI and TUI experiences through the new content store/search service. Replace direct filesystem filters, add a backlog search command (plain output + interactive prefilled view), and surface status/priority dropdowns alongside the new search box in the TUI task list.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 backlog task list and unified view fetch tasks via the content store/search service (no ad-hoc filtering).
- [ ] #2 New backlog search command accepts a query, supports --plain output, and opens the interactive task list with the search field populated when run without --plain.
- [ ] #3 TUI task list header renders search input plus status/priority dropdowns backed by the shared filter API.
- [ ] #4 bun run check ., bunx tsc --noEmit, and bun test cover CLI command + TUI integration.
<!-- AC:END -->
