---
id: task-216
title: Add server API endpoints for sequences
status: To Do
assignee: []
created_date: '2025-07-27'
labels:
  - sequences
  - api
  - backend
dependencies:
  - task-213
---

## Description

Expose sequences to the web UI and support updates when tasks are moved between sequences. Server-side endpoints keep the logic in one place and maintain consistency between interfaces.

## Acceptance Criteria

- [ ] Implement a GET /sequences endpoint (or equivalent) that returns the computed sequences as JSON (sequence number and list of task IDs/titles).
- [ ] Implement a POST /sequences/move (or similar) endpoint that accepts a task ID and target sequence index and updates task dependencies so the moved task belongs to the chosen sequence (without introducing new task properties).
- [ ] Validate input and return appropriate error responses on invalid requests.
- [ ] Ensure that updating dependencies via the move endpoint persists changes to the markdown task files using existing file-system operations.
- [ ] Add unit tests verifying that the endpoints return correct data and update dependencies as expected.
