---
id: task-271
title: Fix acceptance criteria section removal when list emptied
status: To Do
assignee:
  - '@codex'
created_date: '2025-09-17 21:21'
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Codex review on PR 358 notes that serializer only updates the acceptance-criteria section when the in-memory list has entries. After removing every acceptance criterion via the CLI the markdown still keeps the old section. Update the serializer so it runs even with an empty list and verify the CLI flow cleans up the section.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Serializer updates the acceptance criteria section even when the list is empty, removing the block from the task file.
- [ ] #2 Add or update automated coverage to confirm removing all acceptance criteria leaves no acceptance-criteria section in saved markdown.
- [ ] #3 Verify backlog task edit removing all acceptance criteria no longer leaves stale content.
<!-- AC:END -->
