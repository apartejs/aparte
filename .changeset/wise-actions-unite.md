---
"@aparte/core": major
---

Unify custom action registration into one zoned API.

A single `registerAction(action)` now places a button via
`zones: ('composer' | 'bubble')[]`, with per-zone options
(`composer: { position, hidden }`, `bubble: { roles }`). Every action emits the
declarative `aparte:action` event (now carrying `zone`), with an optional
`onClick` callback fired alongside for convenience.

**Breaking:** `registerBubbleAction`, `getRegisteredBubbleActions` and
`unregisterBubbleAction` are removed, and the `AparteBubbleAction` type is merged
into `AparteAction` (use `zones: ['bubble']` + `bubble.roles`). `getActions(zone)`
now requires a zone argument.
