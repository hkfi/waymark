# AI Workflows

Waymark should make AI-assisted development more reliable by giving agents stable project context and by preserving important thinking in local files.

## Agent Context Layers

Agents should read context in this order:

1. `AGENTS.md` for repo rules and required docs.
2. `ARCHITECTURE.md` for system boundaries.
3. `docs/development-standards.md` for coding and UI standards.
4. `projects/waymark/project.yaml` for current project state.
5. `projects/waymark/tickets.yaml` for local roadmap and implementation tickets.
6. Relevant decisions, ideas, thread summaries, or prompts under `projects/waymark/`.

## Waymark As Its Own Workspace

The repo includes a Waymark-readable workspace:

```txt
waymark.yaml
projects/waymark/
```

This lets the app open its own repo folder as a workspace and use the same cockpit model to manage Waymark development.

## Local Ticket To Agent Handoff

The intended loop:

1. Capture an idea or decision in Waymark.
2. Convert or link it to a local ticket.
3. Fill in summary and acceptance criteria.
4. Link relevant files, decisions, thread references, and repo links.
5. Generate a handoff prompt.
6. Paste the prompt into Codex/Claude.
7. Save the resulting thread reference and summary back into Waymark.

## Prompt Standards

Generated handoffs should include:

- task title and goal
- project summary and current focus
- acceptance criteria
- selected repo and file context
- selected decisions and AI thread references
- scoped implementation instructions
- expected verification and completion summary

Generated handoffs should not:

- include secrets
- include entire repositories by default
- assume the agent can access private AI threads
- ask the agent to perform unrelated refactors
- silently update roadmap or decisions without user review

## Future AI Capabilities

Good next steps:

- richer context picker
- import pasted AI thread summaries
- stale context warnings
- read-only MCP server for project state
- GitNexus-aware pre-handoff context suggestions

Defer:

- direct Codex/Claude scraping
- mandatory hosted sync
- automatic AI API calls
- background file rewrites
