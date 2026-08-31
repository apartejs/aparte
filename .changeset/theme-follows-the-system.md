---
"@aparte/core": patch
---

The chat follows the system color scheme by default; `data-aparte-theme` now forces either way — `"light"` is new.

Dark existed only behind `data-aparte-theme="dark"`: on a dark OS, an un-attributed
chat rendered light on the host's dark page — unreadable, with no error. Measured by
a consumer building from the docs alone. With no attribute, `prefers-color-scheme`
now decides; `"dark"` still forces dark; `"light"` (new) forces light, which is the
veto a light-always page needs and the escape a themed island inside an opposite
page uses. If your app already flips the attribute from its own toggle, nothing
changes — the attribute beats the OS in both directions. The dark palette exists
twice in the sheet (a media query and an attribute selector cannot share a block);
`check:derived-vars` now holds the copies byte-identical, and holds the light veto to
the `:root` literals, so the duplicates cannot drift.
