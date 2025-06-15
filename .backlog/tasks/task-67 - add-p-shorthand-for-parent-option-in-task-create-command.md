---
id: task-67
title: Add -p shorthand for --parent option in task create command
status: To Do
assignee: []
created_date: '2025-06-15'
labels:
  - cli
  - enhancement
dependencies: []
---

## Description

Add support for using -p as a shorthand alias for --parent when creating tasks. This will improve the CLI usability by allowing users to specify parent tasks more quickly.

## Acceptance Criteria

- [ ] `-p` option works as an alias for `--parent` in the `task create` command
- [ ] Both `backlog task create "Task title" -p task-5` and `backlog task create "Task title" --parent task-5` produce the same result
- [ ] Help text shows `-p` as the shorthand for `--parent`
- [ ] Existing `--parent` functionality remains unchanged
- [ ] Tests are added to verify both options work correctly
