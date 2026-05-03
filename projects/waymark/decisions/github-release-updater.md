---
id: github-release-updater
title: Ship desktop updates through signed GitHub Releases
date: 2026-05-03
status: accepted
linked_tickets:
  - signed-github-release-updater
---

# Ship desktop updates through signed GitHub Releases

Waymark should distribute desktop updates through GitHub Releases and Tauri's signed updater. This gives users a clear app update path without adding a hosted Waymark backend, login, telemetry, or canonical state outside Markdown/YAML.

Releases are not published for every merge to `main`. Instead, a merged change publishes an updater-visible release only when the app version is intentionally bumped. The app checks static GitHub Release metadata, shows an update indicator when a newer signed version exists, and installs only after the user clicks it.

The updater private key must stay outside the repository in GitHub Actions secrets. Only the public key belongs in `src-tauri/tauri.conf.json`.
