---
id: markdown-yaml-source-of-truth
title: Markdown and YAML stay canonical
date: 2026-04-29
status: accepted
linked_tickets:
  - refine-workspace-file-contract
---

# Markdown and YAML stay canonical

Waymark keeps durable project memory in Markdown and YAML so humans, Git, Codex, Claude, GitNexus, and normal editors can inspect and modify project state without the app.

SQLite or generated indexes may be useful later for search and performance, but they should not become canonical storage for project memory.
