---
"@aparte/core": patch
---

**Fix: a locale switch now reaches the components already on screen.** The docs say
it plainly — "a locale switch is live: mounted components re-render immediately" — and
`setLocale()` does notify. The components honoured only part of it, so switching
language left a **bilingual** interface until a reload rebuilt the elements:

- a **bubble** rebuilt its action-bar labels but kept its old name (`You` /
  `Assistant`), its avatar initial, the `aria-label` of the `‹ ›` branch arrows and of
  the action toolbar, and the waiting indicator's screen-reader label;
- a **viewport** applied `locale.direction` once at render, so a chat already mounted
  never flipped to **RTL**;
- a **conversation list** kept its previous-language row labels (the delete/archive
  buttons, and the fallback title of an untitled conversation) until something else
  happened to re-render it.

All three now refresh on the config change, keeping the existing precedences: an
explicit `name` attribute still outranks the locale, and an instance-scoped config
change never touches a component resolving to another config.
