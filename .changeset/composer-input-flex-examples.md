---
"@aparte/core": patch
---

The composer examples no longer put `style="flex: 1"` on `<aparte-composer-input>` — the stylesheet already gives it `flex: 1 1 auto`, and the inline value changed the basis to `0%`.

Nineteen examples carried it, across the element docblocks the reference pages are generated from, the guides and the demos. It worked everywhere it was written, which is what made it worth removing: copied into a row where the input's content should decide its width, `flex: 1 1 0%` collapses it instead. Reported by a consumer reading the getting-started guide.
