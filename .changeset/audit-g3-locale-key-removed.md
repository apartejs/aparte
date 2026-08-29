---
"@aparte/core": minor
"@aparte/locale-fr": minor
---

Removed the unused locale key `tokensPerSecondLabel`; nothing rendered it.

If you set it, delete the line — it is ignored. A locale annotated `: AparteLocale` (the shape `@aparte/locale-fr` uses) now fails to compile on it; a bare object literal handed straight to `setLocale` still does not, because the open half of that parameter accepts any extra key. Nothing on screen changes: it was the one key of the eighty-odd with no reader anywhere in the repo, and its JSDoc named a "tokens-per-second perf chip" this library does not have.

A locale key is a public contract a translator pays for, so one that renders nowhere is work asked of every locale author for no screen. `config/__tests__/locale.test.ts` now asserts that every declared key appears somewhere outside its two declaration sites, over a corpus with a floor — because a walk that silently shrinks would report "no unread keys" while reading four files.
