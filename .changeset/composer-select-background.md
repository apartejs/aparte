---
"@aparte/core": patch
---

A select inside the composer (the approval switch, the model selector) takes the composer's background instead of the page's.

The select paints `--aparte-select-bg`, which falls back to `--aparte-surface-1`; the composer paints `--aparte-input-bg`. Core's theme makes them equal, so nothing showed until a skin gave the composer a colour of its own: the select kept the page's and drew a darker patch inside the composer. `.aparte-composer-shell` now declares `--aparte-select-bg: var(--aparte-input-bg)`. A select outside the composer is unchanged, and a value set closer to the select (on the toolbar, on the select) still wins.
