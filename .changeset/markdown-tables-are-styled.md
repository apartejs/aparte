---
"@aparte/core": patch
---

Markdown tables in a reply are styled: borders, cell padding, a header row on the surface tone, and a wide table scrolls inside the bubble instead of overflowing it.

The sanitizer had allowlisted `table`/`th`/`td` from the start and no stylesheet ever drew them, so a GFM table rendered as words with no borders and columns that touched. `prose.css` styles it like the rest of the prose, from existing tokens only.
