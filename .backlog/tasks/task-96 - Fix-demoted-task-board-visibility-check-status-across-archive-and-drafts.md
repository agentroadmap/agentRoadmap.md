---
id: task-96
title: Fix demoted task board visibility - check status across archive and drafts
status: Done
assignee:
  - '@Cursor'
created_date: '2025-06-20'
updated_date: '2025-06-20'
labels: []
dependencies: []
---

## Description

## Acceptance Criteria

- [x] Demoted tasks must be removed from board display
- [x] Task status must be checked in archive/drafts folders
- [x] Board should not show tasks that exist in drafts or archive
- [x] Status must be checked across all local branches
- [x] Status must be checked across all remote branches

## Implementation Plan

1. Analyze current board display logic;
2. Implement cross-directory status checking (tasks, drafts, archive);
3. Add logic to check task status across all local git branches;
4. Add logic to check task status across all remote git branches;
5. Update board filtering to exclude demoted/archived tasks found in any branch;
6. Add tests for demoted task visibility;
7. Test branch-specific demotion scenarios;
8. Test remote branch status checking

## Implementation Notes

- **Correction:** The board filtering logic has been completely reworked to correctly handle demoted and archived tasks based on the last commit date.
- The `handleBoardView` function in `src/cli.ts` now determines the definitive state of each task (task, draft, or archived) by finding the most recent version across all local and remote branches.
- It iterates through all branches, finds all task files in the `tasks`, `drafts`, and `archive/tasks` directories, and uses `getFileLastModifiedTime` to get the last commit date for each file.
- It then builds a map of the latest state for each task ID.
- Finally, the board is rendered showing only the tasks whose latest state is 'task', ensuring that any task that has been more recently demoted or archived on any branch is correctly hidden.
- This approach is more robust and correctly implements the intended behavior.
