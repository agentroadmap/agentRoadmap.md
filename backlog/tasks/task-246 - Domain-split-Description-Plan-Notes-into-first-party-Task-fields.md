---
id: task-246
title: 'Domain: split Description/Plan/Notes into first-party Task fields'
status: To Do
assignee:
  - '@codex'
created_date: '2025-09-02 19:59'
updated_date: '2025-09-02 20:45'
labels:
  - domain
  - parsing
  - web-ui
  - tui
dependencies: []
---

## Description

Parse additional sections (Description, Implementation Plan, Implementation Notes) into dedicated Task properties when reading. Maintain the current markdown format on write by composing from these properties. Update serializer/parser and UI to use first-party fields, avoiding duplication and ensuring backward compatibility.

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Expose Task.description as the parsed '## Description' section (string)
- [ ] #2 Expose Task.implementationPlan as parsed '## Implementation Plan' (string)
- [ ] #3 Expose Task.implementationNotes as parsed '## Implementation Notes' (string)
- [ ] #4 Serializer composes body from first-party fields preserving current markdown structure
- [ ] #5 UI reads from first-party fields; Content editor excludes these sections to prevent duplication
- [ ] #6 Maintain backward compatibility for existing tasks and CLI behaviors
- [ ] #7 Add tests for parsing + serialization round-trips
- [ ] #8 Move sections parsing/composition to core (shared by CLI/TUI/Web)
- [ ] #9 Expose Task.sections {description, criteria, plan, notes} in parser output
- [ ] #10 Core serializer composes body from Task.sections (single source of truth)
- [ ] #11 Refactor TUI (src/ui/task-viewer.ts) to render using Task.sections (no body re-parse)
- [ ] #12 CLI plain output uses Task.sections; avoid content duplication (e.g., AC)
- [ ] #13 Deprecate/remove web-only sections util once UI consumes core sections
- [ ] #14 Add core tests for parse/compose and TUI rendering without duplication
<!-- AC:END -->
