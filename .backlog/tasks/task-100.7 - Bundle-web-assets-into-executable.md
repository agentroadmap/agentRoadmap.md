---
id: task-100.7
title: Bundle web assets into executable
status: To Do
assignee: []
created_date: '2025-06-22'
labels: []
dependencies:
  - task-100.1
  - task-100.2
  - task-100.6
parent_task_id: task-100
---

## Description

Configure build process to embed React app in CLI executable

## Acceptance Criteria

- [ ] Vite builds React app to dist/
- [ ] Build script embeds assets in executable
- [ ] Embedded assets served correctly at runtime
- [ ] Production build is optimized
- [ ] Works with bun build --compile
