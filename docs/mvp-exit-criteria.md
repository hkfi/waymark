# MVP Exit Criteria

Waymark should stop treating itself as "MVP" once the core local cockpit loop is stable and useful in real work.

## Exit Criteria

Waymark exits MVP when all of these are true:

- Waymark can manage itself through the repo-root workspace and `projects/waymark/`.
- It can manage at least three real projects from one workspace.
- Project overview, local tickets, ideas, decisions, AI thread references, and handoff generation are usable without editing YAML by hand for normal flows.
- Generated handoff prompts are useful enough to start Codex/Claude implementation threads with less manual context gathering.
- File contract changes have slowed down; breaking schema changes are rare and intentional.
- Validation errors are understandable and point to the relevant file or missing field.
- Important project state remains readable and editable outside Waymark.
- The app has been used for at least one week as the default project cockpit.
- The current user can confidently answer "what is the state of this project?" from Waymark.

## After MVP

After these criteria are met, MVP boundaries can relax. Post-MVP work should still preserve local-first and file-native principles unless a decision record says otherwise.

Good first post-MVP candidates:

- richer search
- better docs/file browser
- Git status display
- read-only MCP server
- SQLite cache/index for derived data
- import helpers for existing project folders
- GitNexus-aware context suggestions

## Review Cadence

Review MVP status whenever:

- three or more post-MVP candidates feel blocked by MVP boundaries
- the app has been used for a week on real projects
- the file contract feels stable across multiple project types
- Waymark is being used to plan and execute its own development
