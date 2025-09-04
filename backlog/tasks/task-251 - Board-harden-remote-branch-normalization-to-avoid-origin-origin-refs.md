---
id: task-251
title: 'Board: harden remote branch normalization to avoid origin/origin refs'
status: To Do
assignee: []
created_date: '2025-09-04 19:34'
labels:
  - bug
  - board
  - git
dependencies: []
priority: high
---

## Description

Follow-up to GitHub issue #315. Running backlog board can fail with git ls-tree errors against origin/origin when branch normalization lets invalid entries (e.g., origin, origin/HEAD, origin/origin) through, producing a malformed ref origin/origin.

Goal: Harden normalization so only canonical remote refs are used and invalid entries are filtered, preventing board load failures.

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 backlog board runs without git ls-tree errors related to origin/origin; no malformed refs are used.
- [ ] #2 normalizeRemoteBranch handles inputs: origin, origin/HEAD, origin/origin, refs/remotes/origin/origin (filtered), and origin/main, refs/remotes/origin/main, main (normalized to use origin/main only).
- [ ] #3 Unit tests cover these cases in task-loader-branch-normalization.test.ts; no call to listFilesInTree/getBranchLastModifiedMap receives origin/origin.
- [ ] #4 listRecentRemoteBranches filters out origin/HEAD and entries that normalize to empty or origin; add a small test if needed.
- [ ] #5 With remoteOperations=false, board loads using local tasks without attempting remote refs.
<!-- AC:END -->
