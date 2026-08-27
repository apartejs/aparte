---
'@aparte/core': patch
---

The readers of core's CSS derive the sheet list from `src/index.ts` instead of keeping a
copy of it.

That import block IS the cascade, and two readers kept a hand-written duplicate of it.
Both had already drifted: the derived-variable guard listed the two primitive sheets but
would not have seen a newly added one, and the docs' CSS-variable generator had neither
— so 269 lines of declarations were absent from the published reference with nothing to
say so. A list that has to be kept equal to an import block is a list that will not be.

`scripts/core-stylesheets.mjs` reads the block, in order, behind a floor.
