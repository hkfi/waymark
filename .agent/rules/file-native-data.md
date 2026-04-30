---
trigger: always_on
---

# File-Native Data Rules

- Treat Markdown/YAML files as the source of truth.
- Do not store canonical project state in SQLite, localStorage, IndexedDB, or generated JSON.
- Use YAML for structured metadata and Markdown for prose.
- Preserve readable diffs.
- Write only the file needed for the explicit user action.
- Never store secrets in project files.
- Generated prompts belong under `ai/prompts/`.
- AI thread summaries belong under `ai/thread-summaries/`.
