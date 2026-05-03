# MVP Boundaries

This document protects Waymark from becoming too broad before the core cockpit workflow is useful.

These are MVP boundaries, not permanent product rules. A boundary can be crossed only when the user explicitly asks for it and the scope change is documented in `docs/roadmap.md`, `projects/waymark/tickets.yaml`, or a decision record.

## MVP Focus

The MVP should prove that Waymark can be used daily as a local project cockpit:

- open a file-native workspace
- show project state
- manage local tickets
- capture ideas and decisions
- reference AI threads
- generate and save agent handoff prompts
- keep all durable state readable outside the app

## Not In MVP

Do not add these unless explicitly promoted:

- hosted backend, accounts, auth, or hosted sync
- telemetry or analytics
- AI API calls, provider SDKs, or built-in AI chat
- scraping Codex, Claude, ChatGPT, Cursor, or other private tool storage
- GitHub, Vercel, Netlify, Supabase, Sentry, PostHog, Linear, or Stripe API integrations
- SQLite or any database as canonical project storage
- automatic repo indexing or whole-repo prompt stuffing
- MCP server
- plugin system
- multi-user collaboration
- complex importers from Notion, Obsidian, GitHub, Linear, or arbitrary repo structures
- full Markdown editor as the primary product surface
- background migrations that rewrite project memory without preview

## Promoted Scope

The Codex-backed assistant is explicitly promoted out of the MVP boundary because it supports the core project-memory loop while preserving the local-first model.

This promotion allows:

- detecting and launching the user's local Codex install
- asking Codex for brainstorming or structured Waymark drafts through the user's Codex auth
- streaming assistant turns through a local ephemeral Codex app-server thread
- review-gated saves of accepted tickets, ideas, decisions, thread references, and summaries
- a CLI fallback route when the experimental app-server route is unavailable

This promotion does not allow:

- Waymark-owned OpenAI API keys or token storage
- scraping Codex, ChatGPT, Claude, Cursor, or private tool state
- direct Codex edits to project memory files
- storing full assistant transcripts by default
- making AI availability required for normal manual capture or handoff workflows

## Allowed In MVP

These are safe MVP improvements:

- clearer validation and warning messages
- better project overview and local ticket UX
- better context selection for handoff prompts
- manual repo/link/thread references
- Markdown/YAML docs that improve agent context
- self-workspace improvements under `projects/waymark/`
- explicit file writes for user-created tickets, notes, decisions, thread references, and prompts
- visual polish that makes the cockpit easier to scan

## Promotion Rule

When promoting something out of "not in MVP":

1. Add or update a roadmap entry.
2. Record the rationale in a decision file if it changes product direction.
3. Add a local ticket with acceptance criteria.
4. Keep Markdown/YAML canonical unless a later decision explicitly changes the storage model.
