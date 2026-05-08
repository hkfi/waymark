---
id: contextual-codex-recommendations
title: Support contextual Codex recommendations for project-memory fields
date: 2026-05-05
status: accepted
linked_tickets:
  - contextual-codex-recommendations
---

# Support contextual Codex recommendations for project-memory fields

Waymark should support a workflow where the human brainstorms with Codex, then turns the durable outcomes into structured project memory. Early project work may involve open-ended conversation, while later project work should increasingly let the human choose, edit, and accept from several context-aware recommendations.

The Assistant should be available near meaningful project-memory fields such as ticket summaries, acceptance criteria, ideas, decisions, thread summaries, handoff sections, project focus, and repo onboarding summaries. These recommendations should use the same local Codex auth, context notice, read-only execution, structured draft validation, and explicit save model as the Assistant drawer.

Waymark should avoid turning every small input into an AI surface. IDs, slugs, file paths, URLs, and tags should remain primarily manual or deterministic fields. Codex may suggest values as part of a review flow, but it must not silently rewrite them.

Accepted records should be easy to link back to Codex thread references or concise thread summaries. This gives future agents useful rationale without assuming Waymark can read private Codex app history.
