---
trigger: always_on
---

# Testing And Verification

Run the narrowest useful checks for the change:

- `pnpm build` for frontend TypeScript and production bundle.
- `cargo check --manifest-path src-tauri/Cargo.toml` for Rust/Tauri command changes.
- `pnpm tauri build --debug` for Tauri config, capability, icon, or native shell changes.

For UI changes:

- Run `pnpm tauri dev` or `pnpm dev`.
- Inspect the affected screen.
- Verify the core interaction path still works.

Do not claim verification was run unless it actually completed.
