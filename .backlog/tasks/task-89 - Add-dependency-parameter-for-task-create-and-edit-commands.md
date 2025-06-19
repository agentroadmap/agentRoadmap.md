---
id: task-89
title: Add dependency parameter for task create and edit commands
status: To Do
assignee: []
created_date: '2025-06-19'
updated_date: '2025-06-19'
labels:
  - cli
  - enhancement
dependencies: []
---

## Description

Currently, task dependencies must be edited manually in the markdown files. This makes it cumbersome to manage task relationships, especially when working through the CLI. We need to add a --depends-on parameter (with --dep shortcut) to both task create and edit commands to allow users to specify dependencies directly from the command line.

This will improve workflow efficiency and make it easier to track which tasks are blocked by others. The implementation should validate that dependency task IDs exist and handle both single and multiple dependencies gracefully.

## Implementation Plan

1. Add --depends-on/--dep option to task create command in cli.ts
2. Add --depends-on/--dep option to task edit command in cli.ts
3. Implement validation in Core to ensure dependency tasks exist (check both tasks and drafts)
4. Support multiple dependencies:
   - Comma-separated: --dep task-1,task-2,task-3
   - Multiple flags: --dep task-1 --dep task-2
5. Handle task ID normalization (accept both 'task-X' and 'X' formats)
6. Update task display to show dependencies clearly in both plain and interactive views
7. Add comprehensive tests for the new functionality
8. Update documentation:
   - README.md: Add examples in CLI usage section showing --dep parameter
   - CLAUDE.md: Update Backlog.md Tool - CLI usage table with dependency examples
   - .cursorrules: Add dependency parameter to relevant sections
   - src/guidelines/: Update all agent instruction files with consistent information
9. Update CLI help text in commander configuration
## Acceptance Criteria

- [ ] Add --depends-on/--dep parameter to task create command
- [ ] Add --depends-on/--dep parameter to task edit command
- [ ] Support multiple dependencies (comma-separated or multiple flags)
- [ ] Validate that dependency task IDs exist
- [ ] Display dependencies in task view (both plain and interactive)
- [ ] Update tests to cover dependency functionality
- [ ] Update CLI help text to document the new parameter
- [ ] Update README.md with examples of dependency usage
- [ ] Update CLAUDE.md with dependency parameter documentation
- [ ] Update .cursorrules with dependency parameter information
- [ ] Update src/guidelines files for consistent agent instructions
