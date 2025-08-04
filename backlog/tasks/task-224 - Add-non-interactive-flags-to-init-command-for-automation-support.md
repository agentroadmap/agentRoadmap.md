---
id: task-224
title: Add non-interactive flags to init command for automation support
status: To Do
assignee: []
created_date: '2025-08-04 16:54'
updated_date: '2025-08-04 16:54'
labels:
  - cli
  - enhancement
dependencies: []
---

## Description

Support non-interactive initialization for automation tools like terminal-bench where interactive prompts are not possible. The command should accept all configuration options as CLI flags to enable seamless integration with CI/CD pipelines and automated workflows.

## Acceptance Criteria

- [ ] All interactive prompts can be bypassed with CLI flags
- [ ] A --defaults flag uses sensible defaults for all options
- [ ] Existing interactive behavior remains unchanged when no flags are provided
- [ ] Help text documents all new flags clearly
- [ ] Non-interactive mode works correctly in CI/CD environments

## Implementation Plan

1. Analyze current init command interactive prompts and configuration options
2. Add CLI flag definitions for all configuration options:
   - --check-branches (boolean, default: true)
   - --include-remote (boolean, default: true) 
   - --branch-days (number, default: 30)
   - --web-ui (boolean, default: true)
   - --auto-open (boolean, default: true)
   - --agent-files (comma-separated list: .cursorrules,CLAUDE.md,AGENTS.md,GEMINI.md,.github/copilot-instructions.md)
   - --install-claude-agent (boolean, default: false)
   - --defaults (use all defaults, skip all prompts)
3. Implement flag parsing and validation logic
4. Update init command to check for flags before showing prompts
5. Update help text and documentation with new flags
6. Add tests for non-interactive mode scenarios
7. Test integration with CI/CD environments

Example usage:
- Full automation: `backlog init --defaults`
- Custom options: `backlog init --check-branches=false --web-ui=false --branch-days=14`
- Mixed mode: `backlog init --defaults --agent-files=CLAUDE.md,AGENTS.md`
