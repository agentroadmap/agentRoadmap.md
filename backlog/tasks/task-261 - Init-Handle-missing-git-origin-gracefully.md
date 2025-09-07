---
id: task-261
title: 'Init: Handle missing git origin gracefully'
status: To Do
assignee:
  - '@codex'
created_date: '2025-09-07 19:57'
labels:
  - cli
  - git
  - init
  - bug
dependencies: []
priority: high
---

## Description

Currently, initialization fails when remote-branch features are enabled but the repository has no git remotes (e.g., no "origin"). Add a preflight check that inspects the current repository before any remote operations (fetch, list remote branches, push). If no remotes exist, skip remote-dependent steps and proceed in local-only mode with a clear, actionable message.

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Init works in a repo with no git remotes (no origin) without crashing
- [ ] #2 Remote-dependent steps are guarded by a preflight check and are skipped when no remotes exist
- [ ] #3 User sees a clear message like: ‘No git remotes detected; skipping remote operations’
- [ ] #4 Behavior with remotes present remains unchanged (no regression)
- [ ] #5 Preflight helper is reused by init and any other remote-using code paths
- [ ] #6 Tests cover no-remote scenario; type-check and lint pass
<!-- AC:END -->
