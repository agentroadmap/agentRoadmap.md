---
id: task-273.02
title: '273.02: Introduce shared content store'
status: To Do
assignee:
  - '@codex'
created_date: '2025-09-19 18:33'
updated_date: '2025-09-19 18:33'
labels:
  - core
  - infra
  - search
dependencies: []
parent_task_id: task-273
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Create a core content store that eagerly loads tasks, documents, and decisions once per process and keeps them in sync via file system watchers. Expose subscription and snapshot APIs so CLI, TUI, and the Bun server can consume a single cache.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Content store loads tasks/docs/decisions on startup and exposes typed getters plus an event/subscription API.
- [ ] #2 File change events (tasks, docs, decisions) trigger in-memory updates without reloading everything.
- [ ] #3 Existing loaders (CLI list, server handlers) can opt into the store without breaking current behavior; legacy direct FS calls are wrapped or routed through the store.
- [ ] #4 bun run check ., bunx tsc --noEmit, and targeted bun test suites pass for the new store.
<!-- AC:END -->
