# Roadmap

This roadmap is the strategic view. Execution details live in `projects/waymark/tickets.yaml`.

## MVP

Goal: prove Waymark is a useful local cockpit for AI-assisted software projects.

Included:

- explicit Waymark workspace format
- project overview
- local tickets as roadmap/execution items
- ideas and decisions
- manual AI thread references
- agent handoff prompt generation
- self-workspace for Waymark development
- agent-readable repo context and development standards
- lightweight validation warnings

Explicitly promoted:

- Codex-backed Assistant for project-memory brainstorming and review-gated drafts through the user's local Codex auth

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
- improve validation messages
- improve ticket creation/editing
- improve handoff context picker
- harden the Codex Assistant review drawer and CLI fallback behavior
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
- import helper for existing repos or folders
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
