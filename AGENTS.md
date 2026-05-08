# AGENTS.md

This is the repo entrypoint for AI agents working on Waymark. Keep changes local-first, file-native, and easy to inspect in Git.

## Read In This Order

1. [`ARCHITECTURE.md`](ARCHITECTURE.md) for stable boundaries, data flow, and invariants.
2. [`docs/README.md`](docs/README.md) for the project documentation map.
3. [`docs/development-standards.md`](docs/development-standards.md) for coding, UI, testing, and documentation expectations.
4. [`docs/ai-workflows.md`](docs/ai-workflows.md) before changing agent handoff, prompt generation, or context files.
5. [`docs/mvp-boundaries.md`](docs/mvp-boundaries.md), [`docs/mvp-exit-criteria.md`](docs/mvp-exit-criteria.md), and [`docs/roadmap.md`](docs/roadmap.md) before adding new product surface area.
6. [`docs/release-policy.md`](docs/release-policy.md) before changing app versions, GitHub Releases, signing, or updater behavior.
7. [`projects/waymark/project.yaml`](projects/waymark/project.yaml) and [`projects/waymark/tickets.yaml`](projects/waymark/tickets.yaml) for the current Waymark project memory.

## Product Invariants

- Markdown/YAML are the source of truth. Do not move canonical project state into SQLite, browser storage, or generated caches.
- Waymark must be useful without a hosted backend, login, external API keys, or AI provider integration.
- Writes must be explicit user actions. Do not silently rewrite project memory files.
- One Waymark project can reference many repos.
- The app should help humans and agents understand project state; generated files should be readable outside the app.
- Keep the MVP cockpit-first: project overview, tickets, ideas, decisions, thread references, and agent handoff.
- Treat MVP boundaries as temporary scope controls. Do not add out-of-MVP capabilities unless explicitly requested and documented.

## Implementation Invariants

- React owns UI state, parsing, validation, and prompt generation.
- Tauri commands should stay small and filesystem-focused.
- Keep native filesystem access scoped to user-provided paths and simple file operations.
- Preserve readable YAML/Markdown formatting where practical.
- Avoid broad refactors unless the task explicitly requires them.
- Prefer small typed helpers over clever generic abstractions.

## Documentation Rules

- If behavior, file contracts, agent workflow, or architecture changes, update the matching doc in the same change.
- If the Waymark workspace schema changes, update `ARCHITECTURE.md`, `docs/ai-workflows.md`, and the self-project files under `projects/waymark/`.
- If a new durable convention is introduced, add it to `docs/development-standards.md` or `.agent/rules/`.
- If an app update should ship, run `pnpm version:set -- <semver>` per `docs/release-policy.md`.

## Validation

Run the narrowest useful checks for your change. Standard checks:

- `pnpm build`
- `cargo check --manifest-path src-tauri/Cargo.toml`
- `pnpm tauri build --debug` for native shell or Tauri config changes

Additional focused checks:

- `pnpm tauri dev` for visual inspection of changed UI workflows.
- `cargo test --manifest-path src-tauri/Cargo.toml codex` for Codex/Assistant bridge changes.
- Live Assistant smoke tests should run only with explicit user approval in a Tauri session, preferably against a disposable or sample workspace.

## GitNexus Workflow

- If this repo has been indexed by GitNexus, use it for unfamiliar flows, broad refactors, symbol moves, or pre-commit scope checks.
- If GitNexus reports a stale or missing index, run `npx -y gitnexus@latest analyze` when an index would materially improve safety.
- It is fine to skip GitNexus for narrow documentation edits, simple styling changes, or obvious one-file fixes.
