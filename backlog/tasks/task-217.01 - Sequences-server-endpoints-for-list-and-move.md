---
id: task-217.01
title: 'Sequences server: endpoints for list and move'
status: In Progress
assignee:
  - '@codex'
created_date: '2025-08-23 19:13'
updated_date: '2025-08-26 19:53'
labels:
  - sequences
dependencies: []
parent_task_id: task-217
---

## Description

Provide GET /sequences (using computeSequences from task-213) and POST /sequences/move to update dependencies and persist changes.

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 GET /sequences returns { unsequenced: Task[], sequences: Sequence[] } (Done excluded)
- [ ] #2 POST /sequences/move applies join semantics: set moved deps to previous sequence; do not modify others; prevent move to Unsequenced unless isolated
- [ ] #3 Input validates task ids/target; returns meaningful errors; updates persisted
<!-- AC:END -->

## Implementation Plan

1. Add GET /api/sequences returning {unsequenced, sequences} (Done excluded)\n2. Add POST /api/sequences/move with join semantics and Unsequenced checks\n3. Validate inputs; persist changed tasks; return updated sequences\n4. Keep code aligned with core helpers (computeSequences, adjustDependenciesForMove, canMoveToUnsequenced)\n5. Run lint/types/tests
