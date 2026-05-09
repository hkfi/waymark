# Development Standards

## Product Principles

- File-native first: important project state belongs in Markdown/YAML.
- Local-first by default: no backend, login, telemetry, or external AI calls in the MVP.
- Human-controlled AI: generate prompts and summaries, but do not silently mutate important files.
- Cockpit over notebook: prioritize project state, local tickets, decisions, thread references, and handoff readiness.

## TypeScript And React

- Keep TypeScript strict and explicit at module boundaries.
- Use functional React components and typed props for new extracted components.
- Prefer derived values with `useMemo` only when it improves clarity or avoids repeated non-trivial work.
- Keep local state near the workflow that owns it.
- Split app-level React state by ownership using focused hooks and context providers instead of broad controller hooks that return large objects.
- Let composed shell/feature containers read the smallest context slice they need; keep lower-level cockpit UI components mostly prop-driven and reusable.
- Avoid adding global state libraries until there is a clear cross-screen need.
- Use `lucide-react` for icons.

## UI Standards

- Waymark is a dense cockpit, not a marketing page.
- Keep information scannable: sidebars, rows, lists, compact panels, and clear selected states.
- Keep primary navigation focused on Overview, Tickets, Memory, and Context. Assistant belongs in the right drawer as an everywhere-available capability, not as a main destination.
- Treat `links.yaml` as the typed Context registry for repos, files, docs, deploys, dashboards, services, domains, design links, and other project resources.
- Do not turn operational data into decorative card grids when a table or row list is clearer.
- Controls should have stable dimensions and deliberate typography.
- Use restrained color: accent for primary actions, muted tones for metadata, warnings for readiness issues.
- Destructive record actions should use danger styling, explain what will be removed, and require explicit confirmation before writing project files.
- Keep keyboard shortcuts aligned with [`keyboard-shortcuts.md`](keyboard-shortcuts.md). Shortcuts may open explicit write workflows or submit visible forms, but must not perform hidden background rewrites.

## Feedback Patterns

- Use app-level toasts for transient operation feedback such as reloaded workspaces, saved prompts, captured records, linked files, update checks, and command availability messages.
- When an explicit project-memory write is undoable, the success toast should expose the next useful history action such as Undo or Redo.
- Do not render transient operation feedback as inline cards in the main cockpit flow; it shifts the content and makes routine actions feel heavier than they are.
- Keep inline notices for contextual, workflow-local information that should remain near the control it explains, such as form validation errors, disabled Tauri-only form warnings, Assistant connection context, and draft parsing warnings.
- App-level toast messages should flow through the shared feedback state rather than each component inventing its own notification UI.

## Undo And Redo

- Record undoable project-memory writes as named file transactions with exact before and after snapshots.
- Keep undo/redo history session-scoped. Do not store history in the Waymark workspace or browser storage.
- Conflict-check every affected file before undo or redo; block the whole operation if any file no longer matches the expected snapshot.
- Treat bulk Assistant saves and generated handoff prompts as one transaction so users can reverse the reviewed write in one step.
- Do not use undo/redo for workspace creation, project creation, app updates, external linked assets, or private AI thread data.

## Tauri And Filesystem

- Keep Rust commands small and boring.
- Do not put parsing, validation, prompt generation, or product logic in Rust unless there is a concrete reason.
- Expand `~/` in native file operations.
- Use the Tauri dialog plugin for user-picked files or folders instead of platform shell scripts.
- Prefer explicit write commands over background sync.
- Keep the native command surface auditable.

## File Format Standards

- YAML is for structured metadata and lists.
- Markdown is for prose, decisions, ideas, summaries, and prompts.
- Generated prompts should be saved as Markdown under `ai/prompts/`.
- Avoid storing secrets, tokens, cookies, or private provider data.
- Keep filenames stable and slug-based.

## Documentation Standards

- Update docs when behavior, file contracts, architecture, or agent workflow changes.
- Add new durable project knowledge to `docs/` or `projects/waymark/`.
- Keep `AGENTS.md` short and navigational.
- Prefer examples over vague policy when documenting file formats.

## Verification Standards

Use the narrowest useful checks:

```bash
pnpm build
cargo check --manifest-path src-tauri/Cargo.toml
pnpm tauri build --debug
```

For undo/redo or project-memory write changes, run the focused Vitest coverage first:

```bash
pnpm test:undo
pnpm test
```

Use `pnpm smoke:native:undo` for a native Tauri smoke pass when a change needs proof that UI actions mutate real local YAML files. This requires `tauri-driver` (`cargo install tauri-driver`) and runs on the official Tauri WebDriver desktop platforms: Linux and Windows. Official `tauri-driver` does not support macOS WKWebView, so macOS native smoke coverage needs a manual Tauri pass or a separate macOS automation driver.

For UI changes, also run the app and inspect the changed workflow visually.

## Release Standards

Waymark publishes desktop updates only from intentional version bumps. Do not bump the app version for every merge to `main`.

When a change should ship as an app update, run `pnpm version:set -- <semver>` so `package.json`, `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock`, and `src-tauri/tauri.conf.json` stay on the same SemVer version. The GitHub release workflow uses the `src-tauri/tauri.conf.json` version change as the release trigger.

See `docs/release-policy.md` before changing release automation, updater behavior, signing keys, or app versions.
