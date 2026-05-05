# Assistant verification pass

Checked the Codex-backed Assistant implementation against the MVP acceptance criteria.

Verified locally:

- `pnpm build` passes.
- `cargo check --manifest-path src-tauri/Cargo.toml` passes.
- A local Codex binary exists at `/Applications/Codex.app/Contents/Resources/codex`.
- `codex login status` reports a ready ChatGPT-backed login.
- Assistant frontend defaults to app-server route, latest model, and high reasoning.
- Assistant UI requires explicit project-context acknowledgement before sending live Codex turns.
- Draft parsing validates unknown or malformed linked ticket, decision, and thread IDs into warnings.
- Draft review keeps tickets, ideas, decisions, and thread references editable and selected before save.
- `cargo test --manifest-path src-tauri/Cargo.toml codex` passes and covers the local Codex bridge helpers.
- CLI fallback argument construction is covered by a no-network unit test, including top-level `--ask-for-approval never`, read-only sandboxing, optional output schema, model settings, and stdin prompt input.

Fixed during verification:

- CLI fallback command construction passed `--ask-for-approval` after `exec`, but the installed Codex CLI only accepts that flag as a top-level option. Moved the flag before `exec` in `src-tauri/src/codex.rs`.
- Extracted the fallback argument builder into a testable helper so future Codex CLI flag drift is easier to catch locally.

Remaining live checks:

- Run a real app-server Assistant turn in Tauri and confirm streamed deltas appear in the conversation.
- Force or simulate app-server failure in the Tauri UI and confirm the CLI fallback route returns a result.
- Save one selected draft set through the UI and confirm only accepted records are written.

Decision for MVP:

- Do not block the MVP implementation on a live Codex smoke test. Local command construction, parsing, draft review, and bridge-helper behavior are covered without sending project context externally.
- Treat the real app-server and CLI smoke as a manual pre-release or regression check. Run it only with explicit user approval in a Tauri session, preferably against a disposable/sample workspace.
