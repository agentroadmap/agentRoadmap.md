---
id: task-235
title: Fix duplicate Acceptance Criteria sections in tasks
status: To Do
assignee:
  - '@codex'
created_date: '2025-08-17 16:05'
labels:
  - cli
  - bug
dependencies: []
priority: high
---

## Description

Some task files can end up with two "Acceptance Criteria" sections (both with AC markers) after a series of CLI edits. The current AC update logic only replaces the first section and leaves any additional sections in place.

Goal: Ensure tasks always contain exactly one Acceptance Criteria section. When duplicates are present, consolidate to a single section (prefer the updated content) and remove others.

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Detect multiple AC sections (with markers) and consolidate to a single section when updating
- [ ] #2 If both legacy (no markers) and marked sections exist, migrate to one marked section
- [ ] #3 Guarantee: after any AC edit, the file contains exactly one AC section with correct numbering
- [ ] #4 Add tests: starting from content with duplicated AC sections, after an AC update only one section remains with expected content
<!-- AC:END -->
