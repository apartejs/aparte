---
'@aparte/core': patch
---

Fixed: `setIconProvider` did not reach six of the glyphs core draws.

The conversation row's archive tray and delete cross, the select's chevron, the attachment
thumbnail's remove button and the artifact card's download arrow imported their glyph
straight from `icons/glyphs.js`. A consumer who registered a provider got most of the
library restyled and those left behind — and `archive`, `unarchive` and `download` were
keys the provider type has always offered with no reader anywhere in the repo. In
`artifact/card.ts` the two sat one line apart: `getIcon('copy')` above, a hardcoded glyph
below.

`icons/glyphs.js` is now imported by exactly one file, `config/icon-provider.ts`, which is
what keeps this true rather than a promise to remember.

Two dead fallbacks went with them: `getIcon()` returns the built-in glyph for any known
key, so `getIcon('paperclip') || this._defaultIcon()` and `scrollIcon || scrollDownIcon`
could never take their right-hand side. They read as a safety net that was not there.
