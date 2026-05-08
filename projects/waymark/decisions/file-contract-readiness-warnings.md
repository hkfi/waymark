---
id: file-contract-readiness-warnings
title: File contract readiness gaps stay warnings through MVP
date: 2026-05-08
status: accepted
linked_tickets:
  - refine-workspace-file-contract
---

# File contract readiness gaps stay warnings through MVP

Waymark should keep the workspace file contract permissive enough for rough planning. Ticket `summary` and `acceptance_criteria` remain optional YAML fields, and thread `summary_file` remains optional.

The app should still surface readiness gaps where they matter most:

- missing ticket summary and acceptance criteria warn for `now`, `next`, and `blocked` tickets
- missing thread summaries warn for completed threads and threads linked to tickets

These warnings make agent handoff and project-memory gaps visible without preventing users from capturing incomplete work. Hard schema requirements can be reconsidered after MVP if warning-only validation is not strong enough in real use.
