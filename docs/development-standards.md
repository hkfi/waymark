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
- Avoid adding global state libraries until there is a clear cross-screen need.
- Use `lucide-react` for icons.

## UI Standards

- Waymark is a dense cockpit, not a marketing page.
- Keep information scannable: sidebars, rows, lists, compact panels, and clear selected states.
- Do not turn operational data into decorative card grids when a table or row list is clearer.
- Controls should have stable dimensions and deliberate typography.
- Use restrained color: accent for primary actions, muted tones for metadata, warnings for readiness issues.

## Tauri And Filesystem

- Keep Rust commands small and boring.
- Do not put parsing, validation, prompt generation, or product logic in Rust unless there is a concrete reason.
- Expand `~/` in native file operations.
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

For UI changes, also run the app and inspect the changed workflow visually.
