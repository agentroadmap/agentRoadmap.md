---
id: task-273.03
title: '273.03: Build core Fuse search service'
status: To Do
assignee:
  - '@codex'
created_date: '2025-09-19 18:33'
updated_date: '2025-09-19 18:33'
labels:
  - core
  - search
dependencies: []
parent_task_id: task-273
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Implement a reusable search module that consumes the shared content store, builds a Fuse.js index for tasks, documents, and decisions, and exposes a query API that returns a typed SearchResult with optional status and priority filters.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Search service indexes tasks/docs/decisions with rawContent + titles using Fuse.js and returns ordered SearchResult objects.
- [ ] #2 Index automatically refreshes when the content store emits updates without full reloads.
- [ ] #3 Filtering by status/priority leverages the same service (no separate list filtering logic).
- [ ] #4 bun run check ., bunx tsc --noEmit, and targeted bun test suites cover search behavior.
<!-- AC:END -->
