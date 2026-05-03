# Keyboard Shortcuts

Waymark shortcuts are designed for the cockpit workflow: move between project-memory surfaces, capture records, prepare agent handoffs, and keep the filesystem-backed workspace fresh.

Use `Cmd` on macOS and `Ctrl` on Windows/Linux.

## Global

| Shortcut | Action |
| --- | --- |
| `Cmd/Ctrl+K` | Focus search and select the current query. |
| `Cmd/Ctrl+N` | Open Capture for the selected project. |
| `Cmd/Ctrl+O` | Choose a workspace folder. |
| `Cmd/Ctrl+R` | Reload the current workspace from disk. |
| `Esc` | Close the active modal. If search is focused, clear search. Otherwise blur the active control. |

## Navigation

| Shortcut | Action |
| --- | --- |
| `Cmd/Ctrl+1` | Overview |
| `Cmd/Ctrl+2` | Assistant |
| `Cmd/Ctrl+3` | Queue |
| `Cmd/Ctrl+4` | Decisions |
| `Cmd/Ctrl+5` | Threads |
| `Cmd/Ctrl+6` | Ideas |
| `Cmd/Ctrl+7` | Files |
| `Cmd/Ctrl+8` | Inbox |
| `Cmd/Ctrl+[` | Previous cockpit section |
| `Cmd/Ctrl+]` | Next cockpit section |

## Tickets And Handoffs

These shortcuts apply when a ticket is selected and a modal or text field is not active.

| Shortcut | Action |
| --- | --- |
| `ArrowUp` / `ArrowDown` | Move selected ticket in queue order. |
| `Space` | Toggle the selected ticket in the handoff bundle. |
| `Cmd/Ctrl+Enter` | Save and copy a handoff prompt for the selected ticket or bundle. |
| `Cmd/Ctrl+Shift+Enter` | Save and copy a handoff prompt for the selected ticket or bundle. |
| `Cmd/Ctrl+E` | Edit selected ticket. |
| `Cmd/Ctrl+Shift+N` | Mark selected ticket Next. |
| `Cmd/Ctrl+B` | Mark selected ticket Blocked. |
| `Cmd/Ctrl+D` | Mark selected ticket Done. |

## Capture

These shortcuts apply while the Capture modal is open.

| Shortcut | Action |
| --- | --- |
| `Cmd/Ctrl+1` | Capture ticket. |
| `Cmd/Ctrl+2` | Capture idea. |
| `Cmd/Ctrl+3` | Capture decision. |
| `Cmd/Ctrl+4` | Capture thread reference. |
| `Cmd/Ctrl+Enter` | Save capture. |
| `Esc` | Cancel capture. |

## Assistant

| Shortcut | Action |
| --- | --- |
| `Cmd/Ctrl+Enter` | Send the prompt, generate/import drafts, or save selected drafts when focus is in draft review. |

## Modal Forms

Most modal forms use `Cmd/Ctrl+Enter` for the primary save/create/add action and `Esc` to cancel.

Shortcuts that would silently write YAML or Markdown still route through the same explicit UI actions as their buttons. Waymark does not use keyboard shortcuts for background rewrites.
