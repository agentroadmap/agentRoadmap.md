---
id: task-101
title: Show task file path in plain view
status: To Do
assignee: []
created_date: '2025-06-24'
updated_date: '2025-07-06'
labels: []
dependencies: []
---

## Description

Update the backlog task <id> --plain and backlog draft <id> --plain commands to include the full file path of the markdown file being viewed. This allows AI agents and automation scripts to locate the actual task or draft file in the repository for further processing or editing. When using these commands with the --plain flag, the file path should be included in the output to help with automation and AI agent workflows.
## Acceptance Criteria

- [ ] backlog task <id> --plain outputs the markdown file path
- [ ] backlog draft <id> --plain outputs the markdown file path
- [ ] File path is absolute and correctly formatted
- [ ] Path is included as the first line or clearly marked section
- [ ] Maintain backward compatibility with existing plain output format
- [ ] Unit tests cover both task and draft commands
- [ ] Test with various task IDs and file locations
