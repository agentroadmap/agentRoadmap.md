---
id: task-217.01
title: 'Sequences server: endpoints for list and move'
status: To Do
assignee: []
created_date: '2025-08-23 19:13'
labels:
  - sequences
dependencies: []
parent_task_id: task-217
---

## Description

Provide GET /sequences (using computeSequences from task-213) and POST /sequences/move to update dependencies and persist changes.

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 GET /sequences returns computed sequences (number + task ids/titles)
- [ ] #2 POST /sequences/move updates dependencies and persists
- [ ] #3 Input validated; errors return meaningful messages
<!-- AC:END -->
