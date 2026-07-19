---
"@aparte/core": patch
---

Robustness hardening: bound the file-generation handler map so a generation that never
terminates (e.g. the conversation is cleared mid-flight) can no longer leak its window
listeners for the page's lifetime; add a compile-time exhaustiveness guard on the
stream-event switch so a new event variant fails the typecheck instead of being silently
ignored; and mark every intentional fire-and-forget promise in the streaming / render
paths explicitly (type-aware lint now guards against unhandled rejections).
