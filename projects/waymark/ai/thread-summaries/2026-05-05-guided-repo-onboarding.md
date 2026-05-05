# Guided repo onboarding implementation

Implemented the first deterministic guided repo onboarding pass.

Included:

- Queue one or more local repo folders before saving.
- Preview the readable `project.yaml` repo entries that will be added.
- Preview missing Waymark memory scaffold files before they are created.
- Generate optional `AGENTS.md` repo-instruction drafts for queued local repos.
- Disable repo-instruction writes when `AGENTS.md` already exists, so onboarding does not silently overwrite linked repo files.
- Save only queued repos and selected repo-instruction drafts through controlled write helpers.

Deferred:

- Live Codex-generated onboarding records remain an Assistant/manual workflow. They should run only after explicit user confirmation because they use the user's local Codex auth and may send selected project context externally.
