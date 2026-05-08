# File contract validation pass

Implemented the MVP file-contract validation slice.

Included:

- Added a dedicated workspace file contract document with examples for `waymark.yaml`, `project.yaml`, `tickets.yaml`, `links.yaml`, `threads.yaml`, ideas, decisions, generated prompts, and thread summaries.
- Documented that `links.yaml` is the typed Context registry and removed `project.yaml.links` from the MVP file contract.
- Tightened workspace validation warnings so schema issues name the file and field path instead of silently dropping invalid `tickets.yaml`, `links.yaml`, or `threads.yaml` records.
- Preserved valid sibling records when one record in a list is invalid.
- Added Markdown frontmatter warnings for malformed idea and decision notes.
- Removed the legacy `project.yaml.links` UI/model/prompt path so `links.yaml` is the only canonical typed Context registry during MVP.
- Added generated prompt filename allocation so repeated prompt generation uses numeric suffixes instead of overwriting existing files.
- Refined readiness warnings so missing ticket summary and acceptance criteria only warn for `now`, `next`, and `blocked` tickets.
- Refined thread summary warnings so they apply to completed threads and ticket-linked threads, not every active placeholder.
- Recorded the decision that these readiness gaps stay warnings, not hard schema requirements, through MVP.
- Confirmed the self workspace and a freshly generated sample workspace still load through the workspace loader.

Deferred:

- Reconsidering hard schema requirements after MVP if warning-only validation proves too weak in real use.
