---
id: task-254
title: 'Init: default ''No'' for Claude agent installation'
status: To Do
assignee: []
created_date: '2025-09-04 19:53'
labels:
  - cli
  - init
  - agents
dependencies: []
priority: medium
---

## Description

Change `backlog init` to not add the Claude custom agent by default. The interactive confirm should default to No (pressing Enter = No). Non-interactive mode already defaults to false via `--install-claude-agent` flag.

Goal: Make Claude agent an explicit opt-in during initialization, with clear prompt copy and docs.

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Interactive init: Claude agent confirm defaults to No; pressing Enter does not install it.
- [ ] #2 Prompt copy clarifies opt-in and target path: “Install Claude Code Backlog.md agent? (y/N) Adds to .claude/agents/”.
- [ ] #3 Non-interactive: default remains false; `--install-claude-agent true` opts in explicitly.
- [ ] #4 Update documentation/help to reflect the default change and the flag usage.
- [ ] #5 Add/adjust a minimal test to assert the prompt initial value is false and flag parsing still works.
<!-- AC:END -->
