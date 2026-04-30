---
trigger: always_on
---

# MVP Boundaries

Before adding a feature, check:

- `docs/mvp-boundaries.md`
- `docs/mvp-exit-criteria.md`
- `docs/roadmap.md`

Do not add out-of-MVP capabilities unless the user explicitly asks for them and the scope change is documented.

Common out-of-MVP capabilities:

- hosted backend, auth, accounts, sync, telemetry
- AI API calls or provider SDKs
- scraping AI tool conversations
- GitHub/Vercel/Supabase/Sentry/Linear API integrations
- SQLite or database-backed canonical storage
- MCP server
- plugin system
- broad importers
- full Markdown editor as the primary product surface

MVP-safe work includes:

- cockpit UX improvements
- local tickets, ideas, decisions, thread references
- explicit Markdown/YAML writes
- validation and warning improvements
- generated handoff prompt improvements
- agent context and project standards docs
