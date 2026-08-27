---
'@aparte/engine': patch
---

`runStreamAgent`'s documentation reaches its documentation.

The docblock describing the package's headline export sat six lines and another comment
above the function, separated from it by the `warnUnknownStreamEvent` helper. A docblock
that is not adjacent to its declaration is attached to nothing, so TypeDoc read the
helper's comment as the neighbouring one and the generated `@aparte/engine` reference
carried `runStreamAgent()` with no description at all — the export its own page
description names first.

The helper moves above the block. No behaviour changes; the same trap the
custom-elements analyser has when a class docblock is pushed above an import.
