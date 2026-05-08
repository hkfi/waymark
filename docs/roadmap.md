# Roadmap

This roadmap is the strategic view. Execution details live in `projects/waymark/tickets.yaml`.

## MVP

Goal: prove Waymark is a useful local cockpit for AI-assisted software projects.

Included:

- explicit Waymark workspace format
- project overview
- local tickets as roadmap/execution items
- Memory for ideas, decisions, and thread references
- Context for typed repos, files, docs, deploys, dashboards, services, domains, design links, and other resources
- manual AI thread references
- agent handoff prompt generation
- self-workspace for Waymark development
- agent-readable repo context and development standards
- lightweight validation warnings

Explicitly promoted:

- Codex-backed Assistant for project-memory brainstorming and review-gated drafts through the user's local Codex auth
- GitHub Release based app updates, gated by intentional version bumps and installed only after a user clicks the update indicator
- Guided repo onboarding, where users explicitly add local repos to a project and review any generated Waymark memory or repo context files before saving

Not included:

- hosted sync
- Waymark-owned AI API keys
- external service integrations
- MCP server
- SQLite cache/index
- plugin system

## MVP Hardening

Goal: make the MVP pleasant enough for daily use.

Likely work:

- refine workspace file contract and examples
- add guided repo onboarding for new and existing projects
- improve validation messages
- improve ticket creation/editing
- improve handoff context picker
- refine the simplified Overview/Tickets/Memory/Context cockpit IA
- harden the Codex Assistant review drawer and CLI fallback behavior
- add contextual Codex recommendations to meaningful project-memory fields
- include project standards in generated handoffs
- make the self-workspace more complete
- add focused UI smoke tests or manual QA checklist

## Post-MVP

Goal: add convenience without weakening the file-native model.

Candidates:

- full-text search across project memory
- docs/file browser with Markdown preview
- Git status display for linked repos
- richer links/deploys/dashboard views
- stale context and missing context detection
- GitNexus-aware context suggestions
- SQLite cache/index for derived data only
- stronger Codex app-server cancellation, reconnection, and recovery once the local protocol settles

## V1

Goal: make Waymark a durable local project operating layer.

Candidates:

- read-only local MCP server
- optional write-capable MCP tools with explicit approvals
- richer dependency/service graph
- generated project briefs
- reusable project templates
- more complete thread summary workflows
- optional external integrations that start as links and read-only metadata

## Later

Candidates:

- hosted sync
- team collaboration through Git or optional cloud
- plugin system
- deeper GitHub/Linear/Vercel/Sentry/Supabase integrations
- optional in-app AI features

## Decision Rule

If a feature would make Waymark easier to use daily without adding hidden state, cloud dependencies, or broad integration complexity, it is a better early candidate.

If a feature requires credentials, background sync, external APIs, or canonical state outside Markdown/YAML, it belongs after MVP unless explicitly promoted.
