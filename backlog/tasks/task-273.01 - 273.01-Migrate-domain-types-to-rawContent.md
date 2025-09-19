---
id: task-273.01
title: '273.01: Migrate domain types to rawContent'
status: To Do
assignee:
  - '@codex'
created_date: '2025-09-19 18:33'
updated_date: '2025-09-19 18:33'
labels:
  - core
  - types
  - search
dependencies: []
parent_task_id: task-273
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Rename legacy markdown fields across Task/Document/Decision to use rawContent and remove the remaining acceptanceCriteria string arrays. Update parsing, serialization, file-system loaders, and every consumer (CLI, TUI, web, tests) so the new shape is the single source of truth.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Task, Document, and Decision types expose rawContent instead of body and no longer expose legacy acceptanceCriteria arrays.
- [ ] #2 Markdown parser and serializer round-trip rawContent and structured sections without regressions.
- [ ] #3 All references compile after the rename (bunx tsc --noEmit) and lint/format pass (bun run check .).
- [ ] #4 Existing tests updated to target rawContent (bun test target for affected suites).
<!-- AC:END -->
