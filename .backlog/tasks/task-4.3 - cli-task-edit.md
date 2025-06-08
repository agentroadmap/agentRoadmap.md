---
id: task-4.3
title: "CLI: Task Editing"
status: "To Do"
assignee: ""
reporter: "@MrLesk"
created_date: 2025-06-04
labels: ["cli", "command"]
milestone: "M1 - CLI"
dependencies: ["task-4.2"]
parent_task_id: task-4
---

## Description

Implement editing of existing tasks:

- `backlog task edit <task-id>`

## Acceptance Criteria

- [ ] Updates to title, description, status, labels, and assignee are persisted.
- [ ] The command respects YAML frontmatter formatting.
- [ ] A commit records the changes to the task file.
