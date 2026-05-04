---
id: simplified-cockpit-ia
title: Simplified cockpit IA
date: 2026-05-04
status: accepted
linked_tickets:
  - simplify-cockpit-ia
---

# Simplified cockpit IA

Waymark's primary navigation should stay focused on four cockpit surfaces: Overview, Tickets, Memory, and Context.

Assistant is not a destination. It is an always-available right drawer mode that can use the current project, selected ticket, selected memory record, selected thread, or handoff bundle after the user confirms the Codex context notice.

`links.yaml` is the preferred typed Context registry. It stores repos, files, docs, deploys, dashboards, services, domains, design links, and other resources as readable records with either a URL or a path. Handoff prompts include repos, files, docs, deploys, and design links by default; services, domains, dashboards, and other admin links require `include_in_handoff: true`.
