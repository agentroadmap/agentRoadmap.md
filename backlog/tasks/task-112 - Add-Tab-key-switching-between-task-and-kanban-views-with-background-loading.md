---
id: task-112
title: Add Tab key switching between task and kanban views with background loading
status: To Do
assignee: []
created_date: '2025-07-05'
labels: []
dependencies: []
---

## Description

Implement Tab key functionality to switch between task views (list/detail) and kanban board view with intelligent background loading. When users are in task view, the kanban board should load in the background so that pressing Tab provides instant switching. If the kanban board is still loading remote tasks, show the existing loading screen.

## Acceptance Criteria

- [ ] Pressing Tab in task list view switches to kanban board
- [ ] Pressing Tab in task detail view switches to kanban board  
- [ ] Pressing Tab in kanban board switches back to previous task view (list or detail)
- [ ] Kanban board starts loading in background when entering task views
- [ ] If kanban board is ready, Tab switching is instant
- [ ] If kanban board is still loading, show existing loading screen
- [ ] Background loading doesn't interfere with current task view performance
- [ ] State is preserved when switching between views (selected task, position, etc.)
- [ ] Help text shows Tab shortcut in all relevant views
- [ ] Memory efficient - avoid keeping duplicate data structures

## Implementation Plan

1. **Background Loading Architecture**
   - Add background loading mechanism for kanban board data
   - Track loading state to determine if instant switch is possible
   - Implement efficient caching to avoid redundant data fetching

2. **Tab Key Handling**
   - Add Tab key listeners to task list view
   - Add Tab key listeners to task detail view
   - Add Tab key listeners to kanban board view (for switching back)
   - Implement view switching logic with state preservation

3. **State Management**
   - Track current view type (task list, task detail, kanban)
   - Preserve selected task when switching views
   - Maintain scroll position and other UI state where appropriate

4. **Loading Integration**
   - Integrate with existing loading screen for remote tasks
   - Handle loading failures gracefully
   - Provide user feedback during background loading

5. **Performance Optimization**
   - Ensure background loading doesn't block UI
   - Implement efficient data sharing between views
   - Add memory management for cached data

6. **Testing**
   - Test switching between all view combinations
   - Test with slow/failed remote task loading
   - Test state preservation across switches
   - Test memory usage and performance impact
