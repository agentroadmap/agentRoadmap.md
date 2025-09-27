---
id: task-275
title: Extract task reordering logic to core module
status: To Do
assignee: []
created_date: '2025-09-26 19:07'
labels: []
dependencies: []
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Currently, the task reordering logic for calculating ordinal values is duplicated between the web UI (TaskColumn.tsx) and server (index.ts). This logic should be centralized in the core module to ensure consistency across all interfaces. The core module should provide methods for calculating new ordinal values when moving tasks within columns or between columns, handling ordinal collisions, and bulk updating tasks efficiently. This will enable both the web UI and upcoming TUI drag mode to use the same reliable reordering logic.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Create core/reorder.ts module with reordering utility functions
- [ ] #2 Implement calculateNewOrdinal function that handles positioning before/after tasks
- [ ] #3 Implement resolveOrdinalConflicts function to reassign ordinals when needed
- [ ] #4 Add method to Core class for reordering tasks that uses the new utilities
- [ ] #5 Update web UI to use the new core reordering methods via API
- [ ] #6 Update server reorder endpoint to use core reordering logic
- [ ] #7 Add comprehensive tests for reordering edge cases
<!-- AC:END -->
