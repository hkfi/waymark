# Handoff context picker polish

Implemented the MVP handoff picker policy so generated prompts use explicit context option IDs instead of only broad buckets. Suggested context now includes project standards, repos, linked files, linked decisions, linked AI thread references, and handoff-eligible Context records, with a visible reason for each suggestion and user-controlled include/exclude toggles before save or copy.

The prompt builder keeps legacy bucket IDs working internally while rendering only the selected explicit context rows. Service, domain, dashboard, and other admin Context links remain excluded unless `include_in_handoff: true` is set in `links.yaml`.
