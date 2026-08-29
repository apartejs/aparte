---
"@aparte/core": patch
---

`querySelector('aparte-context' | 'aparte-split' | 'aparte-suggestions')` is now typed — the cast and the untyped `e.detail` are gone.

Those three were the only elements missing from `HTMLElementTagNameMap`: 21 of 24 were mapped, and the three left out were the whole up-stack surface of this release, so the shell code most likely to be written this month was the code that needed a cast.

The map's docstring said `pnpm check:element-map` kept it honest. No such script has ever existed. It is pinned now by a type assertion against the generated `AparteElementTagName` — which comes from the custom-elements manifest and therefore carries every tag by construction — so a missing entry is a compile error naming the tag, in the editor and in `nx typecheck`, which is what the pre-commit hook runs. The other direction (a key no element backs) is a test, because `HTMLElementTagNameMap` is a global interface the plugins augment too.

Two other claims in that docstring were wrong and are corrected: the file is imported by the SSR entry as well as the browser one, on purpose.
