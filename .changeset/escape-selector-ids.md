---
"@aparte/core": patch
---

Harden the internal `[data-segment-id]` / `[message-id]` attribute-selector lookups in
the bubble and viewport against a hostile, stream-supplied id: interpolated ids are now
escaped for the quoted-attribute context (via a small `cssEscape` helper that needs no
`CSS` global, so it also works in SSR/test runtimes). An id containing `"` (e.g. a
provider-supplied tool-call id) can no longer throw a `SyntaxError` that drops a render
update, nor form a selector list that mis-targets another element. Ids are random UUIDs
by default, so this is defense-in-depth.
