---
id: task-214
title: Add CLI command to list sequences (plain and interactive)
status: To Do
assignee: []
created_date: '2025-07-27'
labels:
  - sequences
  - cli
dependencies:
  - task-213
---

## Description

Provide a way to inspect computed sequences via the command line. AI agents need a plain-text output, while human users benefit from an interactive TUI. This command should build on the core compute function from Task 213 and not duplicate logic.

## Acceptance Criteria

- [ ] Introduce a backlog sequence list command (or similar) to list sequences from tasks in the current backlog.
- [ ] When invoked with --plain, output sequences in a machine-readable plain format: list each sequence with its index and the ID/title of each task.
- [ ] When invoked without --plain, launch an interactive TUI (using blessed) that displays sequences vertically and allows scrolling through tasks. Users can press q to exit.
- [ ] Reuse the core sequence function from Task 213; do not compute sequences separately in the CLI.
- [ ] Provide help text in the CLI explaining usage and flags.
- [ ] Add tests verifying that the plain output matches expected formats and that the TUI view launches correctly.
