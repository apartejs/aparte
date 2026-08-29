---
"@aparte/core": minor
"@aparte/locale-fr": minor
---

The application shell: three recipes and one element, so a ChatGPT-style page can be built on aparté alone. `.aparte-app-shell` is the grid (sidebar beside, header above, `__main` in the rest); `.aparte-app-header` is the bar (a toggle shown under 48rem, a title, an `__actions` zone); `<aparte-sidebar>` wears the `.aparte-sidebar` recipe (`__header`, `__search`, `__body`, `__footer`) and carries the three behaviours a column has — it collapses (`collapsed`, reflected; any `[data-aparte-sidebar-toggle]` toggles it; `aparte-sidebar-toggle` fires), it becomes a drawer under 48rem — or under the length its `breakpoint` attribute names, and never with `breakpoint="none"` — (`data-drawer`, a scrim, Escape, focus returned to the opener), and an input carrying `data-aparte-sidebar-search` filters the conversation list by title. Tokens: `--aparte-sidebar-width`, `--aparte-sidebar-bg`, `--aparte-app-header-height`, `--aparte-scrim`; locale key `sidebarLabel`. A guide, "An application shell", shows the whole page with a live demo.

The line was drawn on 2026-08-29: shell chrome without product state is the library's, like the viewport is; a recipe draws, an element exists only where there is behaviour — a header has none, a sidebar has three. What stays with the product: routing, authentication, the storage adapter, the contents of a settings panel.
