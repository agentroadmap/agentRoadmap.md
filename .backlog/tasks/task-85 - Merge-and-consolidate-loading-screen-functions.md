---
id: task-85
title: Merge and consolidate loading screen functions
status: To Do
assignee: []
created_date: '2025-06-18'
labels:
  - refactor
  - optimization
dependencies: []
---

## Description

The codebase currently has two different loading screen functions (`withLoadingScreen` and `createLoadingScreen`) in `src/ui/loading.ts` that have overlapping functionality and duplicated code. Both functions create blessed-based loading screens with spinners and fallback to console output for non-TTY environments. They share similar initialization, styling, spinner animation, and cleanup logic that should be consolidated into a unified, reusable system.

## Acceptance Criteria

- [ ] `withLoadingScreen` and `createLoadingScreen` no longer have duplicated code
- [ ] Both functions continue to work with their existing API signatures
- [ ] All current usages of loading screens in the codebase continue to work unchanged
- [ ] Loading screens display correctly in both TTY and non-TTY environments
- [ ] Escape and Ctrl+C keyboard shortcuts still close loading screens
- [ ] Spinner animation continues to work smoothly
- [ ] No visual or functional regression in loading screen behavior
- [ ] Code is properly documented with JSDoc comments

## Implementation Plan

1. **Analysis Phase**
   - Map current usage of both loading functions
   - Identify duplicated code blocks
   - Document shared functionality

2. **Design Phase**
   - Design a base loading screen utility/class
   - Plan how to extract common elements (spinner, screen setup, TTY fallback)
   - Consider extracting constants (spinner chars, colors, dimensions)

3. **Refactoring Phase**
   - Create shared utilities for common functionality
   - Refactor `withLoadingScreen` to use shared utilities
   - Refactor `createLoadingScreen` to use shared utilities
   - Ensure API compatibility is maintained

4. **Testing Phase**
   - Test all existing loading screen usages
   - Verify TTY and non-TTY behavior
   - Test keyboard interaction
   - Ensure no visual regressions
