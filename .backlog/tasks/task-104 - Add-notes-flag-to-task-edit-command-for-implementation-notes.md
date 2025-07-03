---
id: task-104
title: Add --notes flag to task edit command for implementation notes
status: To Do
assignee: []
created_date: '2025-07-03'
labels: []
dependencies: []
---

## Description

## Acceptance Criteria

- [ ] Users can add implementation notes when marking task as done
- [ ] --notes flag accepts multi-line text
- [ ] Implementation notes are saved to task file under ## Implementation Notes section
- [ ] Command works with status update: backlog task edit <id> -s Done --notes 'notes here'
- [ ] Notes are appended if section already exists
