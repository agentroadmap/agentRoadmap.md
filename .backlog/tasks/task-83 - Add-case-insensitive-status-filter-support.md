---
id: task-83
title: Add case-insensitive status filter support
status: To Do
assignee: []
created_date: '2025-06-18'
labels:
  - enhancement
  - cli
dependencies: []
---

## Description

Allow status filtering to be case-insensitive when using --status/-s flag.

## Acceptance Criteria

- [ ] Status filtering works case-insensitively (e.g., "done", "Done", "DONE" all match "Done" status)
- [ ] Case-insensitive filtering works for both --status and -s flags
- [ ] Existing functionality maintains backward compatibility
- [ ] Update help text to reflect case-insensitive behavior
- [ ] Add tests for case-insensitive filtering with both flags
