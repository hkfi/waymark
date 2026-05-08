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
4. Link relevant files, decisions, thread references, and typed Context records.
5. Generate a handoff prompt.
6. Paste the prompt into Codex/Claude.
7. Save the resulting thread reference and summary back into Waymark.

## Codex-Backed Assistant Loop

The Assistant drawer is an explicitly promoted AI surface for project-memory brainstorming. It is available from every cockpit view and uses the selected project plus current ticket, thread, note, or handoff bundle as context after the user confirms the Codex notice. It uses the user's local Codex installation and Codex auth; Waymark does not read or store Codex credentials.

The Assistant connection panel should separate connection state from connection actions. When local auth is ready, the UI should read as connected and offer a switch-account action rather than implying the user still needs to connect. Codex and ChatGPT should not appear as separate account choices here; Waymark uses the local Codex runtime as the OpenAI account connection. The panel exposes route, model, and reasoning controls; the default is `Latest` model with `High` reasoning. `Latest` means Waymark does not pin a model override and lets the local Codex runtime use its current latest/default model.

The intended loop:

1. User opens a project and opens Assistant from the header, right drawer, or shortcut.
2. Waymark shows Codex availability, route, model, and reasoning settings, then asks for confirmation before sending selected project context and the user's prompt.
3. User brainstorms, asks Codex to structure the prompt, or pastes external Codex output for local parsing.
4. Codex returns streamed assistant text through a local app-server thread, or Waymark falls back to one-shot CLI execution.
5. Waymark validates draft IDs against the current project and turns invalid references into warnings.
6. User reviews, edits, and selects proposed tickets, ideas, decisions, thread references, and summaries.
7. Waymark writes only the accepted records to Markdown/YAML through its existing controlled write helpers.

Assistant outputs should:

- propose project-memory records, not directly edit files
- use an ephemeral read-only Codex thread with approval policy set to never
- apply the selected model and reasoning settings to both app-server and CLI routes
- keep tickets, ideas, decisions, and threads small enough to review
- save thread summaries under `ai/thread-summaries/` only when the user accepts them
- prefer concise summaries over full transcript persistence

Assistant outputs should not:

- ask Codex to use autonomous coding tools for this feature
- assume Waymark can access private Codex or ChatGPT history
- include secrets or account identifiers
- silently create or modify project memory

## Guided Repo Onboarding Loop

Guided repo onboarding is an explicitly promoted AI-adjacent workflow. It should help users attach one or more local repositories to a Waymark project and create an initial project-memory layer around them.

The intended loop:

1. User selects a project and explicitly adds a local repo folder.
2. Waymark records the repo reference in the project file only after the user confirms it.
3. Waymark checks for missing or incomplete Waymark memory files and repo context files.
4. Waymark can offer deterministic scaffolds and optional Codex-generated drafts.
5. User reviews, edits, and accepts the proposed project summary, tickets, decisions, thread references, repo instructions, or handoff context.
6. Waymark writes only the accepted files or records through its controlled write helpers.

During MVP, the deterministic onboarding path is the default: users can queue one or more local repo folders, preview the `project.yaml` repo entries, preview any missing Waymark scaffold files, and optionally accept small generated `AGENTS.md` repo-instruction drafts. Existing repo instruction files are not overwritten. Codex-generated onboarding records remain an optional Assistant workflow and should only run after the user explicitly confirms sending selected project context through the local Codex connection.

Repo onboarding should:

- keep Markdown/YAML as the canonical project memory
- prefer small inspectable drafts over large generated documents
- distinguish Waymark workspace files from files that would be written into a linked repo
- show what will be written before any project memory or repo context file changes
- work without Codex by offering manual forms and deterministic scaffolds
- avoid overwriting existing repo instruction files unless a future explicit edit workflow previews the replacement

Repo onboarding should not:

- automatically index a whole repo in the background
- dump a whole repo into a prompt
- require hosted service credentials or external API integrations
- silently rewrite existing repo files
- let Codex directly mutate workspace or repo files

## Prompt Standards

Generated handoffs should include:

- task title and goal
- project summary and current focus
- acceptance criteria
- selected project standards such as `AGENTS.md`, `.agent/rules/`, and relevant docs
- selected repo and file context
- selected decisions and AI thread references
- handoff-eligible Context records from `links.yaml`
- scoped implementation instructions
- expected verification and completion summary

The handoff prompt inspector should make suggested context explainable before save/copy. Suggested rows should name why they appeared: project standards, project repo reference, linked file, linked decision, linked thread, or handoff-eligible Context record. The user can include or exclude suggested rows before saving or copying the generated Markdown, and the saved prompt should reflect only the selected context.

Generated handoffs should not:

- include secrets
- include entire repositories by default
- include service, domain, dashboard, or admin links unless they are explicitly marked for handoff
- assume the agent can access private AI threads
- ask the agent to perform unrelated refactors
- silently update roadmap or decisions without user review

## Future AI Capabilities

Good next steps:

- import pasted AI thread summaries
- stale context warnings
- read-only MCP server for project state
- GitNexus-aware pre-handoff context suggestions
- app-server cancellation and recovery hardening as Codex's local protocol evolves

Defer:

- direct Codex/Claude scraping
- mandatory hosted sync
- Waymark-owned AI API keys
- background file rewrites
