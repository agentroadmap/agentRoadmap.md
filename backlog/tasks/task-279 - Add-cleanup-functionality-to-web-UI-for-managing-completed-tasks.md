---
id: task-279
title: Add cleanup functionality to web UI for managing completed tasks
status: To Do
assignee: []
created_date: '2025-09-26 19:29'
labels: []
dependencies: []
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The CLI has a cleanup command that moves old Done tasks to the completed folder to declutter the board. This functionality should be available in the web UI with cleanup buttons in strategic locations. The cleanup process asks users to select an age threshold (1 day, 1 week, 2 weeks, etc.), shows a preview of tasks to be moved, and upon confirmation moves them to the completed folder using the same core logic as the CLI command. This helps users maintain a clean board by archiving old completed tasks in bulk.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Add server endpoint /api/tasks/cleanup that accepts age parameter and returns preview
- [ ] #2 Add server endpoint /api/tasks/cleanup/execute that performs the bulk cleanup operation
- [ ] #3 Create CleanupModal component with age selector matching CLI options (1 day to 1 year)
- [ ] #4 Show preview of tasks to be cleaned up with their titles and dates in the modal
- [ ] #5 Add cleanup button at the bottom of Done column in Board view (icon with tooltip)
- [ ] #6 Add cleanup button in TaskList view header when showing Done tasks
- [ ] #7 Display confirmation dialog showing count of tasks to be moved
- [ ] #8 Execute bulk cleanup via API and refresh board/list after completion
- [ ] #9 Show success toast indicating number of tasks moved to completed folder
- [ ] #10 Handle edge cases: no Done tasks, no old tasks, API errors
<!-- AC:END -->
