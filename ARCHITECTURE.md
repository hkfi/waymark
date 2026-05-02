# Waymark Architecture

Waymark is a local-first desktop app for managing software project memory and AI handoffs.

## System Shape

```txt
Waymark workspace folder
  -> Tauri filesystem commands
  -> React workspace loader and validators
  -> In-memory project model
  -> Cockpit UI
  -> Explicit user writes back to Markdown/YAML
```

## Source Of Truth

Markdown and YAML files are canonical. The app may derive UI state from those files, but durable project data must remain readable and editable without Waymark.

Canonical data includes:

- workspace metadata
- project metadata
- repo references
- links
- local tickets
- ideas
- decisions
- AI thread references
- generated handoff prompts

Non-canonical data may eventually include:

- search indexes
- validation caches
- recent views
- UI preferences
- derived graph data

Do not add SQLite as canonical storage.

## Main Modules

- `src/App.tsx`: thin application entrypoint that mounts the cockpit provider and shell.
- `src/app/AppProvider.tsx`: focused React contexts for workspace data, selection, navigation, filters, layout, modals, feedback, and project write actions.
- `src/app/AppShell.tsx`: composed cockpit regions that subscribe to only the context slices they render or invoke.
- `src/app/hooks/`: small state-owner hooks for workspace loading, selection, navigation, filters, pane layout, modal state, feedback, and explicit project writes.
- `src/app/model.ts`: cockpit UI types, constants, and pure helpers shared by views.
- `src/components/primitives.tsx`: reusable cockpit controls such as buttons, cards, chips, table rows, and notices.
- `src/components/shell.tsx`: workspace toolbar, sidebar navigation, main header, and resizable shell chrome.
- `src/components/views.tsx`: main cockpit content views for overview, queue, decisions, threads, files, inbox, and activity.
- `src/components/inspector.tsx`: right-side ticket, handoff, thread, and note inspector panels.
- `src/components/modals.tsx`: explicit user-write workflows for workspace/project creation, capture, ticket editing, and file/link attachment.
- `src/workspace.ts`: file contract, YAML/Markdown parsing, validation, sample workspace creation, controlled writes, and prompt generation.
- `src/types.ts`: shared TypeScript model for workspace/project objects.
- `src/tauri.ts`: typed frontend bridge to native commands.
- `src-tauri/src/lib.rs`: small native command surface for file reads/writes, directory listing, path existence, path opening, and `~/` expansion.

## File Contract

Workspace root:

```txt
waymark.yaml
projects/
  <project-slug>/
    project.yaml
    links.yaml
    tickets.yaml
    threads.yaml
    ideas/
    decisions/
    ai/
      prompts/
      thread-summaries/
```

The repo also includes `projects/waymark/`, a self-project memory folder that lets Waymark open and manage its own roadmap.

## Write Model

All writes must be explicit user actions:

- create/update tickets
- create ideas or decisions
- create AI thread references
- seed sample workspace
- save generated prompts

Avoid background rewrites. If a future feature wants to clean up or migrate files, it should present a preview or run as an explicit migration.

## Agent Handoff Model

Waymark does not call AI APIs in the MVP. It assembles context locally, saves a Markdown prompt, copies it to the clipboard, and links the prompt back to the ticket.

Prompt generation should:

- include project summary and current focus
- include acceptance criteria
- include selected repo, file, decision, thread, and link context
- avoid dumping entire repos into prompts
- keep instructions scoped and implementation-oriented

## Security And Privacy

- No telemetry by default.
- No AI API calls by default.
- No secret storage in project files.
- Native commands should remain simple and auditable.
- External links are user-provided and opened externally.
