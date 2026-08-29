---
"@aparte/core": minor
"@aparte/locale-fr": minor
---

The attachment ✕ label and the searchable select's placeholder are now translatable (`removeAttachment`, `selectSearchPlaceholder`, `selectSearchLabel`).

Three strings were hardcoded English. `aria-label="Remove {file}"` on the pending attachment's ✕ and `aria-label="Search options"` on a searchable `<aparte-select>`'s filter are each the whole of what a screen-reader user hears on an unlabelled control. The third is worse: `placeholder="Search..."` is VISIBLE text, so a French page opened the model picker and read English in the box.

`removeAttachment` uses the `{name}` convention `approvalAsk` and `deleteConversationConfirm` already use, and the file name is interpolated raw and escaped once at the end — reusing the tile's already-escaped name would have escaped a `&` twice and read "rapport &amp;amp; co". All three are translated in `@aparte/locale-fr`, and each keeps its English literal as a fallback so a custom locale that omits one renders a word rather than an empty box.

`node scripts/check-locale-keys.mjs` now cross-checks the two lists in both directions: a `t('…')` naming no declared key, a declared key with no default, and — the half TypeScript cannot see, because every locale key is optional — a key `@aparte/locale-fr` does not translate.
