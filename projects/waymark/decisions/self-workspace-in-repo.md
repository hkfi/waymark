---
id: self-workspace-in-repo
title: Keep a Waymark-readable self workspace in the repo
date: 2026-04-29
status: accepted
linked_tickets:
  - agent-context-foundation
---

# Keep a Waymark-readable self workspace in the repo

Waymark should be able to develop itself. The repo includes `waymark.yaml` and `projects/waymark/` so the app can open this repository as a workspace and expose its own tickets, decisions, ideas, and AI thread references.

This is intentionally lightweight and file-native. It should not replace the docs; it gives the app a structured project cockpit for its own development.
