---
"@aparte/core": minor
---

**Remove the deprecated `<aparte-chat-input>` element** (`AparteChatInput`). It was the legacy
monolithic composer — 653 lines of `innerHTML`-heavy code that auto-registered on import into
the zero-dep core, was untested, and predated the modern `<aparte-composer>` + `<aparte-chat>`
composition. It is no longer exported, registered, or styled; the elicitation panel and the
client's target resolution already preferred `<aparte-composer>` and simply drop the legacy
fallback. Reclaims bundle size and removes an untested surface from core.

**Breaking** (pre-1.0, shipped minor): consumers still on `<aparte-chat-input>` should move to
`<aparte-chat>` (or `<aparte-composer>` directly). The `AparteInputConfig` type stays.
