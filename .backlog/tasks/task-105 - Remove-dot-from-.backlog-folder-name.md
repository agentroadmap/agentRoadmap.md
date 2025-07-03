---
id: task-105
title: Remove dot from .backlog folder name
status: To Do
assignee: []
created_date: '2025-07-03'
labels: []
dependencies: []
---

## Description

Currently tasks are stored in .backlog directory which is hidden. This causes issues with file referencing (e.g., Claude's @ tool) and user interaction outside the CLI. Remove the dot to make it a visible 'backlog' folder.

## Acceptance Criteria

- [ ] Folder renamed from .backlog to backlog
- [ ] All documentation files updated to reference 'backlog' instead of '.backlog'
- [ ] All test files updated to use 'backlog' instead of '.backlog'
- [ ] All source code references updated from '.backlog' to 'backlog'
- [ ] All functionality works correctly after the change
