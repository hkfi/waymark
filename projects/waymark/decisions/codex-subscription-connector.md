---
id: codex-subscription-connector
title: Support Codex subscription auth through the local Codex runtime
date: 2026-05-02
status: accepted
linked_tickets:
  - codex-backed-assistant
---

# Support Codex subscription auth through the local Codex runtime

Waymark should support a Codex-backed assistant by using the user's local Codex installation and Codex auth rather than introducing a Waymark-owned OpenAI API key or token store.

This keeps the app local-first and explicit: Waymark detects Codex, asks the user before sending project context, starts an ephemeral read-only app-server thread when available, receives streamed assistant output and structured drafts, validates them, and writes only the records the user accepts.

Normal OpenAI API chat remains optional future scope. It may be useful later for users who want provider-key based automation, but it should not be required for the project-memory cockpit.
