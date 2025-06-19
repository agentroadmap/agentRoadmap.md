---
id: task-91
title: 'Fix Windows issues: empty task list and weird Q character'
status: To Do
assignee: []
created_date: '2025-06-19'
updated_date: '2025-06-19'
labels:
  - bug
  - windows
  - regression
dependencies: []
---

## Description

The implementation of task-88 (commit 0390046) introduced regression issues on Windows. The task list view shows an empty list even though tasks exist, and the weird 'Q' character that was previously fixed in commit 7d5b414 has reappeared next to the 'Tasks' title. 

The Q character issue was previously fixed by using Unicode non-breaking spaces (\u00A0) instead of regular spaces in labels. The empty list issue might be related to the keys: true and vi: true settings added to the generic list component for scrolling support. We need to ensure Windows compatibility while maintaining the scrolling fixes.

## Implementation Plan

1. Review changes from task-88 implementation (commit 0390046)
2. Identify what broke the Windows compatibility (likely the keys: true and vi: true settings)
3. Apply the Unicode non-breaking space fix (\u00A0) to labels as done in commit 7d5b414
4. Review if keys: true and vi: true settings are causing the empty list on Windows
5. Consider platform-specific settings for Windows compatibility
6. Test the task list view on Windows to ensure tasks are displayed
7. Verify the Q character issue is resolved
8. Test on other platforms to ensure no regression

## Acceptance Criteria

- [ ] Task list displays all tasks correctly on Windows
- [ ] Remove weird Q character next to Tasks title
- [ ] Ensure fix from commit 7d5b414 is preserved
- [ ] Test on Windows platform to verify the fix
- [ ] Ensure the fix doesn't break Linux/macOS functionality
