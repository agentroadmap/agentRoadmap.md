---
id: task-107
title: Add agents --update-instructions command
status: To Do
assignee: []
created_date: '2025-07-03'
updated_date: '2025-07-03'
labels: []
dependencies: []
---

## Description

Add a new command 'backlog agents --update-instructions' that updates the project's agent instruction files (.cursorrules, CLAUDE.md, AGENTS.md, GEMINI.md, .github/copilot-instructions.md) with the latest versions embedded in the current Backlog CLI installation. This command follows the same pattern as 'backlog init' but only updates the agent-related files to ensure projects have up-to-date instructions for AI agents.

## Acceptance Criteria

- [ ] New 'agents' command group is created
- [ ] --update-instructions flag updates agent instruction files (.cursorrules CLAUDE.md AGENTS.md GEMINI.md .github/copilot-instructions.md)
- [ ] Command follows same pattern as 'backlog init' for file updates
- [ ] Command handles cases where files don't exist
- [ ] Command provides confirmation of successful update
- [ ] Help text documents the new command
- [ ] Tests verify the command works correctly
