---
'@aparte/core': minor
---

New entry point: `@aparte/core/icons`, with 41 glyphs core itself never draws.

```ts
import { searchIcon, trashIcon } from '@aparte/core/icons';
button.innerHTML = searchIcon;
```

They cover the vocabulary around a chat rather than inside one — search, filter, folder,
code, trash, settings, user, bot, database, globe, key, mic, eye, clock, history, star,
share, sun/moon, and the arrows and chevrons.

**A separate entry point, not an addition to the built-in set**, and the reason is
mechanical: `getIcon(name)` reads `APARTE_DEFAULT_ICON_FALLBACKS` by a computed key, so
a bundler cannot tell which entries a build reaches and keeps the object whole. Anything
added there ships to everyone, used or not. These are individual exports instead —
import three, pay for three, and nothing at all if you never open the module. Measured
on the built output: `@aparte/core` grows 554 bytes (a chunk boundary) and contains none
of them; `@aparte/core/icons` is 21.6 kB and shares the built-in glyph chunk, so a
consumer of both never pays for a drawing twice.

Every glyph carries `class="aparte-icon"`, so `--aparte-icon-size` sizes it wherever it
lands. Shapes and names follow Lucide, so swapping in the real thing changes the import
and nothing else; nothing is imported from it.

The full set is on the generated **Icons** reference page, each glyph shown at its
export name.
