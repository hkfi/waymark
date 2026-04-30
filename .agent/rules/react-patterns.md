---
trigger: always_on
---

# React Patterns

- Use functional components.
- Use typed props when extracting components.
- Keep workflow state close to the screen or panel that owns it.
- Avoid global state until multiple independent surfaces need the same state.
- Prefer clear helper functions over clever abstractions.
- Use `lucide-react` icons for command buttons and status affordances.
- Keep UI controls dense, stable, and accessible.

## Component Boundaries

- `App.tsx` may orchestrate MVP screens, but extract components when a workflow grows too large to reason about.
- Keep parsing, validation, file writes, and prompt generation in `workspace.ts` or focused modules under `src/`.
- Keep Tauri bridge calls behind `src/tauri.ts`.
