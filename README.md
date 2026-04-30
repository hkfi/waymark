# Waymark

Waymark is a local-first project cockpit for AI-assisted software work.

It keeps project memory in readable Markdown/YAML files, then gives you a desktop UI for scanning project state, tracking local tickets, capturing ideas and decisions, referencing AI threads, and generating Codex/Claude-ready handoff prompts.

## MVP Shape

- Tauri + React + TypeScript desktop app.
- Markdown/YAML are the source of truth.
- No hosted backend.
- No SQLite in the MVP.
- No AI API calls in the MVP.
- One Waymark project can reference many repos.
- Controlled writes for tickets, notes, thread records, and generated prompts.

## Run Locally

Install dependencies:

```bash
pnpm install
```

Start the desktop app:

```bash
pnpm tauri dev
```

Build the frontend:

```bash
pnpm build
```

Build a debug desktop bundle:

```bash
pnpm tauri build --debug
```

## Workspace Model

Waymark expects an explicit workspace folder:

```txt
WaymarkWorkspace/
  waymark.yaml
  projects/
    glossa/
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

The app can seed a sample workspace at:

```txt
/Users/hirokifuruichi/code/waymark/sample-workspace
```

## Core Workflow

1. Open or seed a Waymark workspace.
2. Review projects in the workspace dashboard.
3. Capture project tickets, ideas, decisions, and AI thread references.
4. Select a local ticket.
5. Review readiness warnings and context selection.
6. Generate an agent handoff prompt.
7. Waymark saves the prompt under `ai/prompts/` and copies it to the clipboard.

## Verification

Current checks:

```bash
pnpm build
cargo check --manifest-path src-tauri/Cargo.toml
pnpm tauri build --debug
```

## Notes

The MVP intentionally keeps integrations manual. Repos, deploys, dashboards, and AI threads are stored as local references and links rather than fetched through external APIs.
