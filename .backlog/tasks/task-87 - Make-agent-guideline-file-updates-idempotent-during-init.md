---
id: task-87
title: Make agent guideline file updates idempotent during init
status: To Do
assignee: []
created_date: '2025-06-19'
labels:
  - enhancement
  - cli
  - init
dependencies: []
---

## Description

Currently, when running `backlog init` and selecting agent guideline files (CLAUDE.md, AGENTS.md, .cursorrules), the system should append Backlog.md-specific instructions to existing files. However, if init is run multiple times, content may be duplicated. We need to make this process idempotent - ensuring that the Backlog.md guidelines are only added once, regardless of how many times init is executed.

## Acceptance Criteria

- [ ] Running `backlog init` multiple times does not duplicate agent guideline content
- [ ] Existing agent guideline files are preserved with Backlog.md content appended at the bottom
- [ ] If Backlog.md content already exists in the file, it is not added again
- [ ] Each agent file type has a unique marker/identifier to detect existing Backlog.md content
- [ ] New files are created normally if they don't exist
- [ ] The appended content includes clear section headers indicating it's from Backlog.md
- [ ] All three agent file types (.cursorrules, CLAUDE.md, AGENTS.md) handle idempotency correctly
- [ ] No data loss occurs when updating existing files

## Implementation Plan

1. **Add Content Markers**
   - Define unique markers/comments for each file type to identify Backlog.md sections
   - Examples: `<!-- BACKLOG.MD GUIDELINES START -->` and `<!-- BACKLOG.MD GUIDELINES END -->`

2. **Implement Detection Logic**
   - Check if files exist before writing
   - Read existing content and search for Backlog.md markers
   - Skip appending if markers are found

3. **Update Append Logic**
   - Wrap Backlog.md content with markers
   - Ensure proper newlines/spacing when appending
   - Preserve existing file content

4. **Test Scenarios**
   - Test with non-existent files
   - Test with existing files without Backlog.md content
   - Test with files already containing Backlog.md content
   - Test running init multiple times in succession
