---
"@aparte/core": minor
---

**The built-in segment renderers install themselves the first time a segment needs
one.** `registerDefaultRenderers()` had exactly one caller: `new AparteClient()` —
the object the *bring your own loop* guide tells you not to construct. A
display-only app therefore rendered `[Unknown segment type: text]` for every reply,
with working bubbles, working streaming and working scroll, so the only thing missing
was the content and it read as a bug in the consumer's own loop. The guide never
mentioned the call either.

The sweep is **strictly additive**: a renderer you registered yourself is never
replaced, so a custom `text` renderer survives the install a `code` segment triggers.
`registerDefaultRenderers()` still works and is still what the examples do — it is
simply no longer the difference between a chat that renders and one that doesn't.

`AparteClient({ autoRegister: false })` still means what it says: declining is
remembered, so nothing installs the built-ins later. Do it at startup, before the
first segment renders.

The unknown-type warning now names the fix for the case that remains (a type core has
never heard of) instead of pointing at a call you no longer need.
