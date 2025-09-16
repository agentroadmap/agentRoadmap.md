---
id: task-266
title: Fix Implementation Notes heading truncation in web UI
status: To Do
assignee:
  - '@codex'
created_date: '2025-09-16 19:16'
updated_date: '2025-09-16 19:17'
labels:
  - web-ui
  - bug
dependencies: []
priority: high
---

## Description

GitHub issue #356 (https://github.com/MrLesk/Backlog.md/issues/356) reports that Markdown headings inside the Implementation Notes section disappear after save/view because the parser stops at the next `##`. Update parsing/serialization so notes support nested headings without dropping content, keeping web UI preview/edit intact.

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 H2 or deeper headings inside Implementation Notes render fully in the task modal preview and edit modes.
- [ ] #2 Parser prefers Implementation Notes sentinel markers and still supports legacy tasks without them.
- [ ] #3 Serializer emits a single sentinel-wrapped Implementation Notes block; append/replace flows do not duplicate markers.
- [ ] #4 Automated tests cover nested heading scenarios for parser, serializer, and web UI.
<!-- AC:END -->


## Implementation Plan

1. Introduce sentinel comments around Implementation Notes when serializing and teach the parser to read them, falling back for legacy tasks.
2. Update markdown serializer/append helpers and API responses to use the new structure, ensuring save/append flows remain stable.
3. Add regression tests (parser, serializer, web UI integration) proving headings inside notes continue to render.
