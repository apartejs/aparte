---
"@aparte/core": patch
---

The copy buttons now work on plain `http://` — a code block, the artifact card and the bubble's action bar fall back to `document.execCommand('copy')` where `navigator.clipboard` does not exist. `copyText(text)` is exported so your own copy button can take the same path.

`navigator.clipboard` is secure-context only. On `http://192.168.1.x` — the LAN box running a local model, this library's own archetypal deployment — the property is `undefined`, so each of the three buttons threw a TypeError in its click handler before the `.catch()` it carried for a *rejected* write, and did nothing, silently. Same wall as `crypto.randomUUID` and `uuid()`; `pnpm check:secure-context` now confines both APIs to their one fallback.
