---
id: task-108
title: 'Fix bug: Acceptance criteria removed when updating description'
status: To Do
assignee: []
created_date: '2025-07-03'
updated_date: '2025-07-03'
labels: []
dependencies: []
---

## Description

When using backlog task edit commands to update specific sections (description, acceptance criteria, implementation plan, implementation notes), other sections are being removed or affected. Each section should be updated independently without affecting other sections of the task file.

## Acceptance Criteria

- [ ] Updating task description preserves all other sections
- [ ] Updating acceptance criteria preserves all other sections
- [ ] Updating implementation plan preserves all other sections
- [ ] Updating implementation notes preserves all other sections
- [ ] Task edit commands only modify the specified section
- [ ] Tests verify all sections are preserved during individual updates
- [ ] Bug is reproducible and then fixed
