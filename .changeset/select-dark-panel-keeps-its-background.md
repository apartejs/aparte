---
"@aparte/core": patch
---

`<aparte-select>`'s dropdown panel reads `--aparte-select-dropdown-bg` in the dark theme too. Its dark rule used to repaint the panel from `--aparte-select-bg` — the trigger's background — so a transparent trigger (a pill on a coloured page) made the open list see-through in the dark, with the page's text showing through the options. The dark override is gone altogether: every colour of the select reads a token the derived layer already resolves per theme. And the trigger's label follows a list refreshed in place (a consumer writing into `.aparte-select-options`, as the model selector does): it kept showing a label the list no longer offered.
