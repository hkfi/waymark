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

On first launch, the app can create a sample workspace at:

```txt
~/Documents/Waymark Sample Workspace
```

Use the sample to see Waymark's cockpit with projects, tickets, decisions, ideas, and AI thread references before creating a real workspace.

This repository is also a Waymark-readable workspace. Open the repo root:

```txt
/Users/hirokifuruichi/code/waymark
```

Waymark will read `waymark.yaml` and `projects/waymark/` so the app can be used to manage its own local tickets, decisions, ideas, and AI handoffs.

## AI Agent Context

Start with:

- [`AGENTS.md`](AGENTS.md): repo entrypoint for AI agents.
- [`CLAUDE.md`](CLAUDE.md): Claude-compatible pointer to the same rules.
- [`ARCHITECTURE.md`](ARCHITECTURE.md): system boundaries and invariants.
- [`docs/development-standards.md`](docs/development-standards.md): coding and UI standards.
- [`docs/ai-workflows.md`](docs/ai-workflows.md): how Waymark should support agent handoffs.
- [`docs/mvp-boundaries.md`](docs/mvp-boundaries.md): what not to build during MVP.
- [`docs/mvp-exit-criteria.md`](docs/mvp-exit-criteria.md): how to know when MVP is over.
- [`docs/roadmap.md`](docs/roadmap.md): strategic product roadmap.
- [`projects/waymark/`](projects/waymark): app-readable project memory for Waymark itself.

## Core Workflow

1. Open, create, or sample a Waymark workspace.
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
