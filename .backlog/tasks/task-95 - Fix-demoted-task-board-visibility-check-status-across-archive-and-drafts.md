---
id: task-95
title: Fix demoted task board visibility - check status across archive and drafts
status: To Do
assignee: []
created_date: '2025-06-20'
updated_date: '2025-06-20'
labels: []
dependencies: []
---

## Description

## Acceptance Criteria

- [ ] Demoted tasks must be removed from board display
- [ ] Task status must be checked in archive/drafts folders
- [ ] Board should not show tasks that exist in drafts or archive
- [ ] Status must be checked across all local branches
- [ ] Status must be checked across all remote branches

## Implementation Plan

1. Analyze current board display logic; 
2. Implement cross-directory status checking (tasks, drafts, archive); 
3. Add logic to check task status across all local git branches; 
4. Add logic to check task status across all remote git branches; 
5. Update board filtering to exclude demoted/archived tasks found in any branch; 
6. Add tests for demoted task visibility; 
7. Test branch-specific demotion scenarios; 
8. Test remote branch status checking
