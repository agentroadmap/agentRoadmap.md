# CLI Reference

Full command reference for agentRoadmap.md. For getting started, see [README.md](README.md).

## Project Setup

| Action      | Example                                              |
|-------------|------------------------------------------------------|
| Initialize project | `roadmap init [project-name]` (creates roadmap structure with a minimal interactive flow) |
| Re-initialize | `roadmap init` (preserves existing config, allows updates) |
| Advanced settings wizard | `roadmap config` (no args) — launches the full interactive configuration flow |

`roadmap init` keeps first-run setup focused on the essentials:
- **Project name** – identifier for your roadmap (defaults to the current directory on re-run).
- **Integration choice** – decide whether your AI tools connect through the **MCP connector** (recommended) or stick with **CLI commands (legacy)**.
- **Instruction files (CLI path only)** – when you choose the legacy CLI flow, pick which instruction files to create (CLAUDE.md, AGENTS.md, GEMINI.md, Copilot, or skip).
- **Advanced settings prompt** – default answer "No" finishes init immediately; choosing "Yes" jumps straight into the advanced wizard documented in [ADVANCED-CONFIG.md](ADVANCED-CONFIG.md).

The advanced wizard includes interactive Definition of Done defaults editing (add/remove/reorder/clear), so project checklist defaults can be managed without manual YAML edits.

You can rerun the wizard anytime with `roadmap config`. All existing CLI flags (for example `--defaults`, `--agent-instructions`) continue to provide fully non-interactive setups, so existing scripts keep working without change.

## Documentation

- Document IDs are global across all subdirectories under `roadmap/docs`. You can organize files in nested folders (e.g., `roadmap/docs/guides/`), and `roadmap doc list` and `roadmap doc view <id>` work across the entire tree. Example: `roadmap doc create -p guides "New Guide"`.

## State Management

| Action      | Example                                              |
|-------------|------------------------------------------------------|
| Create state | `roadmap state create "Add OAuth System"`                    |
| Create with description | `roadmap state create "Feature" -d "Add authentication system"` |
| Create with assignee | `roadmap state create "Feature" -a @sara`           |
| Create with status | `roadmap state create "Feature" -s "In Progress"`    |
| Create with labels | `roadmap state create "Feature" -l auth,backend`     |
| Create with priority | `roadmap state create "Feature" --priority high`     |
| Create with plan | `roadmap state create "Feature" --plan "1. Research\n2. Implement"`     |
| Create with AC | `roadmap state create "Feature" --ac "Must work,Must be tested"` |
| Add DoD items on create | `roadmap state create "Feature" --dod "Run tests"` |
| Create without DoD defaults | `roadmap state create "Feature" --no-dod-defaults` |
| Create with notes | `roadmap state create "Feature" --notes "Started initial research"` |
| Create with final summary | `roadmap state create "Feature" --final-summary "PR-style summary"` |
| Create with deps | `roadmap state create "Feature" --dep state-1,state-2` |
| Create with refs | `roadmap state create "Feature" --ref https://docs.example.com --ref src/api.ts` |
| Create with docs | `roadmap state create "Feature" --doc https://design-docs.example.com --doc docs/spec.md` |
| Create sub state | `roadmap state create -p 14 "Add Login with Google"`|
| Create (all options) | `roadmap state create "Feature" -d "Description" -a @sara -s "To Do" -l auth --priority high --ac "Must work" --notes "Initial setup done" --dep state-1 --ref src/api.ts --doc docs/spec.md -p 14` |
| List states  | `roadmap state list [-s <status>] [-a <assignee>] [-p <parent>]` |
| List by parent | `roadmap state list --parent 42` or `roadmap state list -p state-42` |
| View detail | `roadmap state 7` (interactive UI, press 'E' to edit in editor) |
| View (AI mode) | `roadmap state 7 --plain`                           |
| Edit        | `roadmap state edit 7 -a @sara -l auth,backend`       |
| Add plan    | `roadmap state edit 7 --plan "Implementation approach"`    |
| Add AC      | `roadmap state edit 7 --ac "New criterion" --ac "Another one"` |
| Add DoD     | `roadmap state edit 7 --dod "Ship notes"` |
| Remove AC   | `roadmap state edit 7 --remove-ac 2` (removes AC #2)      |
| Remove multiple ACs | `roadmap state edit 7 --remove-ac 2 --remove-ac 4` (removes AC #2 and #4) |
| Check AC    | `roadmap state edit 7 --check-ac 1` (marks AC #1 as done) |
| Check DoD   | `roadmap state edit 7 --check-dod 1` (marks DoD #1 as done) |
| Check multiple ACs | `roadmap state edit 7 --check-ac 1 --check-ac 3` (marks AC #1 and #3 as done) |
| Uncheck AC  | `roadmap state edit 7 --uncheck-ac 3` (marks AC #3 as not done) |
| Uncheck DoD | `roadmap state edit 7 --uncheck-dod 3` (marks DoD #3 as not done) |
| Mixed AC operations | `roadmap state edit 7 --check-ac 1 --uncheck-ac 2 --remove-ac 4` |
| Mixed DoD operations | `roadmap state edit 7 --check-dod 1 --uncheck-dod 2 --remove-dod 4` |
| Add notes   | `roadmap state edit 7 --notes "Completed X, working on Y"` (replaces existing) |
| Append notes | `roadmap state edit 7 --append-notes "New findings"` |
| Add final summary | `roadmap state edit 7 --final-summary "PR-style summary"` |
| Append final summary | `roadmap state edit 7 --append-final-summary "More details"` |
| Clear final summary | `roadmap state edit 7 --clear-final-summary` |
| Add deps    | `roadmap state edit 7 --dep state-1 --dep state-2`     |
| Archive     | `roadmap state archive 7`                             |

### Multi-line input (description/plan/notes/final summary)

The CLI preserves input literally; `\n` sequences are not auto-converted. Use one of the following to insert real newlines:

- **Bash/Zsh (ANSI-C quoting)**
  - Description: `roadmap state create "Feature" --desc $'Line1\nLine2\n\nFinal paragraph'`
  - Plan: `roadmap state edit 7 --plan $'1. Research\n2. Implement'`
  - Notes: `roadmap state edit 7 --notes $'Completed A\nWorking on B'`
  - Append notes: `roadmap state edit 7 --append-notes $'Added X\nAdded Y'`
  - Final summary: `roadmap state edit 7 --final-summary $'Shipped A\nAdded B'`
  - Append final summary: `roadmap state edit 7 --append-final-summary $'Added X\nAdded Y'`
- **POSIX sh (printf)**
  - `roadmap state create "Feature" --desc "$(printf 'Line1\nLine2\n\nFinal paragraph')"`
- **PowerShell (backtick)**
  - `roadmap state create "Feature" --desc "Line1`nLine2`n`nFinal paragraph"`

Tip: Help text shows Bash examples with escaped `\\n` for readability; when typing, `$'\n'` expands to a newline.

## Search

Find states, documents, and decisions across your entire roadmap with fuzzy search:

| Action             | Example                                              |
|--------------------|------------------------------------------------------|
| Search states       | `roadmap search "auth"`                        |
| Filter by status   | `roadmap search "api" --status "In Progress"`   |
| Filter by priority | `roadmap search "bug" --priority high`        |
| Combine filters    | `roadmap search "web" --status "To Do" --priority medium` |
| Plain text output  | `roadmap search "feature" --plain` (for scripts/AI) |

**Search features:**
- **Fuzzy matching** -- finds "authentication" when searching for "auth"
- **Interactive filters** -- refine your search in real-time with the TUI
- **Live filtering** -- see results update as you type (no Enter needed)

## Draft Workflow

| Action      | Example                                              |
|-------------|------------------------------------------------------|
| Create draft | `roadmap state create "Feature" --draft`             |
| Draft flow  | `roadmap draft create "Spike GraphQL"` → `roadmap draft promote 3.1` |
| Demote to draft| `roadmap state demote <id>` |

## Dependency Management

Manage state dependencies to create execution sequences and prevent circular relationships:

| Action      | Example                                              |
|-------------|------------------------------------------------------|
| Add dependencies | `roadmap state edit 7 --dep state-1 --dep state-2`     |
| Add multiple deps | `roadmap state edit 7 --dep state-1,state-5,state-9`    |
| Create with deps | `roadmap state create "Feature" --dep state-1,state-2` |
| View dependencies | `roadmap state 7` (shows dependencies in state view)  |
| Validate dependencies | Use state commands to automatically validate dependencies |

**Dependency Features:**
- **Automatic validation**: Prevents circular dependencies and validates state existence
- **Flexible formats**: Use `state-1`, `1`, or comma-separated lists like `1,2,3`
- **Visual sequences**: Dependencies create visual execution sequences in board view
- **Completion tracking**: See which dependencies are blocking state progress

## Board Operations

| Action      | Example                                              |
|-------------|------------------------------------------------------|
| Kanban board      | `roadmap board` (interactive UI, press 'E' to edit in editor) |
| Export board | `roadmap board export [file]` (exports Kanban board to markdown) |
| Export with version | `roadmap board export --export-version "v1.0.0"` (includes version in export) |

## Statistics & Overview

| Action      | Example                                              |
|-------------|------------------------------------------------------|
| Project overview | `roadmap overview` (interactive TUI showing project statistics) |

## Web Interface

| Action      | Example                                              |
|-------------|------------------------------------------------------|
| Web interface | `roadmap browser` (launches web UI on port 6420) |
| Web custom port | `roadmap browser --port 8080 --no-open` |

## Documentation

| Action      | Example                                              |
|-------------|------------------------------------------------------|
| Create doc | `roadmap doc create "API Guidelines"` |
| Create with path | `roadmap doc create "Setup Guide" -p guides/setup` |
| Create with type | `roadmap doc create "Architecture" -t technical` |
| List docs | `roadmap doc list` |
| View doc | `roadmap doc view doc-1` |

## Decisions

| Action      | Example                                              |
|-------------|------------------------------------------------------|
| Create decision | `roadmap decision create "Use PostgreSQL for primary database"` |
| Create with status | `roadmap decision create "Migrate to TypeScript" -s proposed` |

## Agent Instructions

| Action                                          | Example                                              |
|-------------------------------------------------|------------------------------------------------------|
| Update agent legacy CLI agent instruction files | `roadmap agents --update-instructions` (updates CLAUDE.md, AGENTS.md, GEMINI.md, .github/copilot-instructions.md) |

## Maintenance

| Action      | Example                                                                                      |
|-------------|----------------------------------------------------------------------------------------------|
| Cleanup done states | `roadmap cleanup` (move old completed states to completed folder to cleanup the kanban board) |

Full help: `roadmap --help`

---

## Sharing & Export

### Board Export

Export your Kanban board to a clean, shareable markdown file:

```bash
# Export to default agentRoadmap.md file
roadmap board export

# Export to custom file
roadmap board export project-status.md

# Force overwrite existing file
roadmap board export --force

# Export to README.md with board markers
roadmap board export --readme

# Include a custom version string in the export
roadmap board export --export-version "v1.2.3"
roadmap board export --readme --export-version "Release 2024.12.1-beta"
```

Perfect for sharing project status, creating reports, or storing snapshots in version control.

---

## Shell Tab Completion

agentRoadmap.md includes built-in intelligent tab completion for bash, zsh, and fish shells. Completion scripts are embedded in the binary — no external files needed.

**Quick Installation:**
```bash
# Auto-detect and install for your current shell
roadmap completion install

# Or specify shell explicitly
roadmap completion install --shell bash
roadmap completion install --shell zsh
roadmap completion install --shell fish
```

**What you get:**
- Command completion: `roadmap <TAB>` → shows all commands
- Dynamic state IDs: `roadmap state edit <TAB>` → shows actual state IDs from your roadmap
- Smart flags: `--status <TAB>` → shows configured status values
- Context-aware suggestions for priorities, labels, and assignees

Full documentation: See [completions/README.md](completions/README.md) for detailed installation instructions, troubleshooting, and examples.
