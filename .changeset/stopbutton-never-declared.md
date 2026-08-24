---
'@aparte/core': patch
'@aparte/locale-fr': patch
---

**Fix: the stop button's accessible name was never translatable, in any language.**

`aparte-composer-cancel` has read `t('stopButton')` since it existed, and
`stopButton` was declared nowhere — not in `AparteLocale`, not in
`APARTE_DEFAULT_LOCALE`, not in `@aparte/locale-fr`. So `t()` returned nothing and
the `|| 'Stop'` fallback rendered every time, in every locale, including after a
full reload. The key is declared now, with its English default, and translated in
`@aparte/locale-fr`.

This is the second instance of a defect `locale.ts` already records for
`submitButton` one entry up: *"A key read and never declared is worse than a
literal: it looks translated."* It was found by auditing something else entirely.

Why it survived: the button carries **no visible text**. The string is its
`aria-label` and its `title`, so nothing on screen was ever in the wrong language —
only a screen-reader user, or someone hovering, would have met it. Most of the
composer's translatable surface is like this, which is worth knowing before trusting
that the rest of it works.

The key is optional, like the other fifteen, so no consumer locale becomes invalid:
a locale without it keeps the English default.

Nothing about the landing page changed except that it now *counts* the keys in
`AparteLocale` at build time instead of saying "forty" — adding one key made five
hand-written "forty"s wrong in the same commit that added it.
