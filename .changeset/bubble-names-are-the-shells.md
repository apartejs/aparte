---
'@aparte/core': patch
---

A custom bubble shell keeps the accessible names it wrote itself — its action bar's and its branch arrows' — through a language switch or any config change; the bubble refreshes only the names it wrote.

Every config change used to rewrite the action bar's and the branch arrows' `aria-label` with the locale's, a shell's own labels included, so a shell that named them in its own words lost those names at the first language switch, model pick or late provider.
