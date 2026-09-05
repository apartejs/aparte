---
"@aparte/core": patch
---

The application header's sidebar toggle shows at every width while the sidebar is collapsed, so a sidebar closed on a desktop can be opened again. Nothing to change on your side if your header carries `.aparte-app-header__toggle` with `data-aparte-sidebar-toggle`, the shape the recipe documents.

On the chat site at 1440px, collapsing the sidebar with its own toggle took it to 0px, `inert` and `aria-hidden`, its toggle with it, while the header's toggle was `display: none` outside the phone media query: nothing on the page reopened it. The sidebar keeps `aria-expanded` on every `[data-aparte-sidebar-toggle]`, so the recipe shows the header's control exactly when the sidebar is closed (`.aparte-app-header__toggle[aria-expanded="false"]`), on top of the drawer case it already had.
