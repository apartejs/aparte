---
'@aparte/core': patch
---

The elicitation panel's "Other…" row lines up with the options above it.

It is a choice row and was missing `aparte-field-choice`, the recipe every sibling row
carries — so it had no `display: flex` and its control stacked ABOVE its own label while
the options above it sat inline. It had no focus outline either, for the same reason: the
recipe carries that too.

Visible in a question with the free-text escape enabled, which is the default. Found by
looking at a screenshot of the running panel, not by reading the code.
