# Advanced Configuration

For getting started and the interactive wizard overview, see [README.md](README.md#-configuration).

## Configuration Commands

| Action      | Example                                              |
|-------------|------------------------------------------------------|
| View all configs | `roadmap config list` |
| Get specific config | `roadmap config get defaultEditor` |
| Set config value | `roadmap config set defaultEditor "code --wait"` |
| Enable auto-commit | `roadmap config set autoCommit true` |
| Bypass git hooks | `roadmap config set bypassGitHooks true` |
| Enable cross-branch check | `roadmap config set checkActiveBranches true` |
| Set active branch days | `roadmap config set activeBranchDays 30` |

Running `roadmap config` with no arguments launches the interactive advanced wizard, including guided Definition of Done defaults editing (add/remove/reorder/clear).

## Available Configuration Options

| Key               | Purpose            | Default                       |
|-------------------|--------------------|-------------------------------|
| `defaultAssignee` | Pre-fill assignee  | `[]`                          |
| `defaultStatus`   | First column       | `To Do`                       |
| `definition_of_done` | Default DoD checklist items for new states | `(not set)` |
| `statuses`        | Board columns      | `[To Do, In Progress, Done]`  |
| `dateFormat`      | Date/time format   | `yyyy-mm-dd hh:mm`            |
| `includeDatetimeInDates` | Add time to new dates | `true`              |
| `defaultEditor`   | Editor for 'E' key | Platform default (nano/notepad) |
| `defaultPort`     | Web UI port        | `6420`                        |
| `autoOpenBrowser` | Open browser automatically | `true`            |
| `remoteOperations`| Enable remote git operations | `true`           |
| `autoCommit`      | Automatically commit state changes | `false`       |
| `bypassGitHooks`  | Skip git hooks when committing (uses --no-verify) | `false`       |
| `zeroPaddedIds`   | Pad all IDs (states, docs, etc.) with leading zeros | `(disabled)`  |
| `checkActiveBranches` | Check state states across active branches for accuracy | `true` |
| `activeBranchDays` | How many days a branch is considered active | `30` |
| `onStatusChange`  | Shell command to run on status change | `(disabled)` |

## Detailed Notes

> Editor setup guide: See [Configuring VIM and Neovim as Default Editor](roadmap/docs/doc-002%20-%20Configuring-VIM-and-Neovim-as-Default-Editor.md) for configuration tips and troubleshooting interactive editors.

> **Note**: Set `remoteOperations: false` to work offline. This disables git fetch operations and loads states from local branches only, useful when working without network connectivity.

> **Git Control**: By default, `autoCommit` is set to `false`, giving you full control over your git history. State operations will modify files but won't automatically commit changes. Set `autoCommit: true` if you prefer automatic commits for each state operation.

> **Git Hooks**: If you have pre-commit hooks (like conventional commits or linters) that interfere with roadmap.md's automated commits, set `bypassGitHooks: true` to skip them using the `--no-verify` flag.

> **Performance**: Cross-branch checking ensures accurate state tracking across all active branches but may impact performance on large repositories. You can disable it by setting `checkActiveBranches: false` for maximum speed, or adjust `activeBranchDays` to control how far back to look for branch activity (lower values = better performance).

> **Status Change Callbacks**: Set `onStatusChange` to run a shell command whenever a state's status changes. Available variables: `$STATE_ID`, `$OLD_STATUS`, `$NEW_STATUS`, `$STATE_TITLE`. Per-state override via `onStatusChange` in state frontmatter. Example: `'if [ "$NEW_STATUS" = "In Progress" ]; then claude "State $STATE_ID ($STATE_TITLE) has been assigned to you. Please implement it." & fi'`

> **Date/Time Support**: agentRoadmap.md now supports datetime precision for all dates. New items automatically include time (YYYY-MM-DD HH:mm format in UTC), while existing date-only entries remain unchanged for backward compatibility. Use the migration script `bun src/scripts/migrate-dates.ts` to optionally add time to existing items.
