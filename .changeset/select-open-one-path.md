---
"@aparte/core": patch
---

Setting `open` on `<aparte-select>` — the attribute or the property, after mount or in the initial markup — now runs the same path as a click: `aria-expanded` follows in both directions, the keyboard highlight is seeded on open and cleared on close, and `aparte-select-open` / `aparte-select-close` fire once per transition. A disabled select still refuses to open, and drops the `open` attribute rather than leaving it claiming otherwise.

The attribute had a branch of its own that unhid the panel and stopped there, so the documented way to control the dropdown produced a state a click never produces: a visible list announced as collapsed, with the arrow keys starting from nowhere. The branch now delegates, guarded against the re-entry the two methods' own reflecting writes cause.
