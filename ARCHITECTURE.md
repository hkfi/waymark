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
  -> Optional user-confirmed Codex assistant drafts
  -> Optional signed GitHub Release app updates
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
- typed project context records for repos, files, docs, deploys, dashboards, services, domains, design links, and other resources
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
- `src/components/views.tsx`: main cockpit content views for overview, tickets, memory, context, and activity.
- `src/components/inspector.tsx`: right-side ticket, handoff, assistant, thread, and note inspector panels.
- `src/components/modals.tsx`: explicit user-write workflows for workspace/project creation, capture, ticket editing, and file/link attachment.
- `src/components/assistant.tsx`: optional Codex-backed project-memory assistant with confirmation, draft review, and explicit accepted writes.
- `src/assistant.ts`: structured draft schema, Codex prompt construction, and client-side draft validation.
- `src/app/hooks/useAppUpdates.ts`: Tauri updater state for checking GitHub Release metadata, exposing update availability, and installing only after a user action.
- `src/workspace.ts`: file contract, YAML/Markdown parsing, validation, sample workspace creation, controlled writes, and prompt generation.
- `src/types.ts`: shared TypeScript model for workspace/project objects.
- `src/tauri.ts`: typed frontend bridge to native commands.
- `src-tauri/src/lib.rs`: native entrypoint that registers plugins, managed state, and the command surface.
- `src-tauri/src/file_commands.rs`: small filesystem command surface for file reads/writes, directory listing, path existence, path opening, `~/` expansion, and native folder picking.
- `src-tauri/src/codex.rs`: user-initiated Codex status, login, CLI execution, and app-server session calls.

## File Contract

The durable field-level contract and examples live in [`docs/workspace-file-contract.md`](docs/workspace-file-contract.md). The stable shape is:

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

`links.yaml` is the typed Context registry. `project.yaml` stores project metadata and repo references, but it should not contain a `links` map during MVP. Context records belong in `links.yaml` so type, label, environment, path-or-URL, and handoff eligibility stay explicit.

```yaml
version: 1
links:
  - id: production
    label: Production app
    type: deploy
    url: https://example.com
    environment: production
    include_in_handoff: true
  - id: domain-registrar
    label: Namecheap
    type: domain
    url: https://ap.www.namecheap.com/
    include_in_handoff: false
  - id: architecture
    label: Architecture
    type: file
    path: ARCHITECTURE.md
```

Context `type` values are `repo`, `file`, `deploy`, `dashboard`, `doc`, `design`, `service`, `domain`, and `other`. A record must have `url` or `path`. When `include_in_handoff` is omitted, repos, files, docs, deploys, and design links are included by default; services, domains, dashboards, and other resources are not.

## Write Model

All writes must be explicit user actions:

- create/update tickets
- create ideas or decisions
- create AI thread references
- create typed context records in `links.yaml`
- create a sample workspace
- save generated prompts

Avoid background rewrites. If a future feature wants to clean up or migrate files, it should present a preview or run as an explicit migration.

Sample workspace creation is a first-run user action. The app may suggest `~/Documents/Waymark Sample Workspace`, but it must not create or overwrite sample files until the user clicks the sample action.

## Agent Handoff Model

Waymark's baseline workflow does not require AI APIs. It assembles context locally, saves a Markdown prompt, copies it to the clipboard, and links the prompt back to the ticket.

Prompt generation should:

- include project summary and current focus
- include acceptance criteria
- include selected repo, file, decision, thread, and link context
- include only handoff-eligible typed context records from `links.yaml`; service, domain, dashboard, and other admin links stay out unless explicitly marked
- avoid dumping entire repos into prompts
- keep instructions scoped and implementation-oriented

## Codex Assistant Model

The Codex-backed Assistant is an explicitly promoted optional right-drawer surface available from every cockpit view. It detects the user's local Codex install, relies on Codex's own local auth, starts an ephemeral read-only app-server thread, and sends project plus current selection context only after the user confirms the session notice.

The assistant should:

- request structured drafts for tickets, ideas, decisions, and thread references
- stream app-server assistant deltas into the UI and fall back to CLI execution on app-server failure
- validate proposed IDs in React before writing
- save only user-accepted records and concise summaries
- keep Waymark as the only writer to project memory files

The assistant should not:

- read or store Codex credentials
- scrape private Codex, ChatGPT, Claude, or Cursor storage
- let Codex directly mutate the workspace for this feature
- make AI connectivity required for manual project workflows

## App Update Model

Waymark uses Tauri's signed updater and GitHub Releases. `main` should remain releasable, but desktop updates are published only when the app version is intentionally bumped. The release workflow creates signed updater artifacts and `latest.json`; the app checks that static metadata and shows an update indicator only when a newer signed version exists.

Updates should:

- keep `package.json`, `src-tauri/Cargo.toml`, and `src-tauri/tauri.conf.json` on the same SemVer version
- use GitHub Releases as the distribution and updater metadata host
- commit only the updater public key
- keep the private updater signing key in GitHub Actions secrets
- require an explicit user click before installing

Updates should not:

- install silently
- depend on a hosted Waymark backend
- store updater state in the Waymark workspace file contract
- use GitHub API integrations for product data during MVP

## Security And Privacy

- No telemetry by default.
- No Waymark-owned AI API calls by default.
- No secret storage in project files.
- Native commands should remain simple and auditable.
- External links are user-provided and opened externally.
