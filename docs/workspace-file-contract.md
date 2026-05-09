# Workspace File Contract

Waymark workspaces are ordinary folders. YAML and Markdown are the source of truth, and every durable record should remain readable without opening the app.

## Folder Shape

```txt
waymark.yaml
projects/
  <project-slug>/
    project.yaml
    links.yaml
    tickets.yaml
    threads.yaml
    ideas/
      <idea-id>.md
    decisions/
      <decision-id>.md
    ai/
      prompts/
        <date>-<ticket-id>.md
      thread-summaries/
        <summary-id>.md
```

The directory name under `projects/` should match `project.yaml.slug`.

## `waymark.yaml`

Workspace metadata. `projects_dir` defaults to `projects`.

```yaml
version: 1
name: Waymark Self Workspace
projects_dir: projects
```

Required fields:

- `version`: number
- `name`: non-empty string
- `projects_dir`: non-empty string

## `project.yaml`

Project metadata and repo references. This file is intentionally small so humans can scan the project at a glance.

```yaml
version: 1
name: Waymark
slug: waymark
status: active
stage: prototype
summary: Local-first project cockpit for AI-assisted software work.
current_focus: Make file-native project memory dependable.
tags:
  - local-first
  - tauri
repos:
  - id: app
    name: Waymark app
    path: ~/code/waymark
    url: https://github.com/example/waymark
```

Required fields:

- `version`: number
- `name`: non-empty string
- `slug`: non-empty string
- `status`: `active`, `paused`, `exploring`, or `archived`
- `stage`: `idea`, `spec`, `prototype`, `mvp`, `alpha`, `beta`, or `production`
- `summary`: non-empty string

Optional fields:

- `current_focus`: short current priority
- `tags`: list of strings
- `repos`: list of repo references

Repo references require `id`, `name`, and at least one of `path` or `url`.

## `links.yaml`

Typed Context registry for repos, files, docs, deploys, dashboards, services, domains, design links, and other resources. Context records should be written here, not to `project.yaml`.

```yaml
version: 1
links:
  - id: architecture
    label: Architecture
    path: ARCHITECTURE.md
    type: file
    environment: local
    include_in_handoff: true
  - id: production
    label: Production app
    url: https://example.com
    type: deploy
    environment: production
```

Each record requires:

- `id`: non-empty string
- `label`: non-empty string
- `type`: `repo`, `file`, `deploy`, `dashboard`, `doc`, `design`, `service`, `domain`, or `other`
- at least one of `url` or `path`

Optional fields:

- `environment`: `production`, `staging`, `preview`, `local`, or `other`
- `include_in_handoff`: boolean

When `include_in_handoff` is omitted, repos, files, docs, deploys, and design links are included by default. Services, domains, dashboards, and other admin links are excluded by default.

## `tickets.yaml`

Local ticket board.

```yaml
version: 1
tickets:
  - id: refine-workspace-file-contract
    title: Refine workspace file contract
    status: now
    priority: high
    summary: Tighten schemas and warnings around Waymark files.
    acceptance_criteria:
      - File contract is documented with examples.
      - Validation warnings name files and fields.
    linked_files:
      - src/workspace.ts
    linked_decisions:
      - markdown-yaml-source-of-truth
    linked_threads:
      - file-contract-validation-2026-05-05
    generated_prompts:
      - ai/prompts/2026-05-05-refine-workspace-file-contract.md
```

Each ticket requires:

- `id`: non-empty string
- `title`: non-empty string
- `status`: `idea`, `now`, `next`, `later`, `blocked`, or `done`

Optional fields:

- `priority`: `low`, `medium`, or `high`
- `summary`: short task summary
- `acceptance_criteria`: list of strings
- `linked_files`: project-relative paths or readable file references
- `linked_decisions`: decision ids
- `linked_threads`: thread ids
- `generated_prompts`: paths under `ai/prompts/`

## `threads.yaml`

References to AI or editor-agent threads. Waymark stores references and summaries, not full private transcripts by default.

```yaml
version: 1
threads:
  - id: file-contract-validation-2026-05-05
    provider: codex
    title: File contract validation pass
    status: active
    url: null
    summary_file: ai/thread-summaries/2026-05-05-file-contract-validation.md
    linked_tickets:
      - refine-workspace-file-contract
```

Each thread requires:

- `id`: non-empty string
- `provider`: `codex`, `claude`, `chatgpt`, `cursor`, or `other`
- `title`: non-empty string
- `status`: `active`, `completed`, `paused`, or `abandoned`

Optional fields:

- `url`: external thread URL or `null`
- `summary_file`: path under `ai/thread-summaries/`
- `linked_tickets`: ticket ids

## `ideas/*.md`

Idea notes are Markdown files with optional YAML frontmatter.

```markdown
---
id: local-context-search
title: Local context search
date: 2026-05-05
status: open
linked_tickets:
  - improve-handoff-context-picker
---

# Local context search

Let users search tickets, decisions, thread summaries, and context records from one command surface.
```

Waymark derives missing `id` and `title` from the filename or first Markdown heading. `linked_tickets` should be a list of ticket ids when present.

## `decisions/*.md`

Decision notes use the same Markdown/frontmatter shape as ideas, usually with `status: accepted`.

```markdown
---
id: markdown-yaml-source-of-truth
title: Markdown and YAML are source of truth
date: 2026-04-29
status: accepted
linked_tickets:
  - agent-context-foundation
---

# Markdown and YAML are source of truth

Waymark stores durable project memory in readable files instead of a hosted backend or canonical database.
```

## `ai/prompts/*.md`

Generated handoff prompts are Markdown artifacts. A prompt becomes canonical only when Waymark writes it after an explicit user action and records its path in `tickets.yaml.generated_prompts`.

Prompt filenames start as `ai/prompts/YYYY-MM-DD-<ticket-id>.md`. If that file already exists, Waymark appends a numeric suffix such as `-2` or `-3` so generating another prompt never overwrites an earlier one.

Prompt content is assembled from the handoff picker. Suggested context can include project standards, repos, linked files, linked decisions, linked thread references, and handoff-eligible `links.yaml` records; only the rows selected by the user should appear in the saved Markdown.

```markdown
# Task: Refine workspace file contract

## Goal

Tighten schemas and warnings around Waymark files.

## Project

Waymark

...
```

## `ai/thread-summaries/*.md`

Thread summaries are concise Markdown notes referenced from `threads.yaml.summary_file`.

```markdown
# File contract validation pass

Codex tightened workspace validation warnings and documented the canonical file contract.
```

## Deletion Behavior

Waymark delete actions are explicit project-memory writes. They should confirm what will be removed and avoid deleting external project assets by implication.

- Deleting a ticket removes the record from `tickets.yaml`; linked notes, prompt files, and thread summary files are left alone.
- Deleting a Context registry item removes the record from `links.yaml`; the target file, URL, service, or deploy is not deleted.
- Removing a repo reference updates `project.yaml.repos`; the repository folder is not deleted.
- Unlinking a ticket file removes the path from `tickets.yaml.linked_files`; the file itself is not deleted.
- Deleting a thread reference removes the record from `threads.yaml` and unlinks its id from tickets; any `summary_file` Markdown remains.
- Deleting an idea or decision removes the Markdown file from `ideas/` or `decisions/`; deleting a decision also unlinks its id from tickets.
- Removing a generated prompt reference updates `tickets.yaml.generated_prompts`; the prompt Markdown file remains in `ai/prompts/`.

Undoable deletes restore exact project-memory file snapshots when the affected files still match the recorded post-delete state. If a file changed externally after the delete, Waymark blocks the undo instead of merging or force-applying stale snapshots.

## Validation Behavior

Waymark should prefer specific warnings over silent drops:

- workspace-level parse errors name `waymark.yaml`
- invalid projects are skipped with `projects/<slug>/project.yaml` warnings
- invalid records in `tickets.yaml`, `links.yaml`, and `threads.yaml` are skipped while valid sibling records still load
- warnings include the file and field path, such as `tickets.yaml: tickets[0].status`
- idea and decision frontmatter warnings name the Markdown file
- missing operational context warnings name the relevant canonical file, such as `project.yaml: repos` or `links.yaml: links`
- missing ticket `summary` and `acceptance_criteria` warnings apply to active work only: `now`, `next`, and `blocked`
- missing thread `summary_file` warnings apply to completed threads and threads linked to tickets

Validation should not rewrite files. Cleanup, migration, or schema repair should remain a previewed user action.

## MVP Readiness Policy

These pieces should stay stable unless a later decision says otherwise:

- keep project metadata and repo references in `project.yaml`
- keep typed context records in `links.yaml`
- keep repos in `project.yaml.repos`
- keep tickets, threads, ideas, decisions, prompts, and thread summaries in their current files

Readiness gaps should remain warnings through MVP, not hard schema requirements:

- ticket `summary` and `acceptance_criteria` are optional in `tickets.yaml`, but missing values warn for `now`, `next`, and `blocked` tickets
- thread `summary_file` is optional in `threads.yaml`, but missing values warn for completed threads and threads linked to tickets

This keeps Waymark useful for rough planning and partial memory capture while still making agent-readiness gaps visible. Hard requirements can be reconsidered after MVP if warning-only validation proves too weak in real use.
