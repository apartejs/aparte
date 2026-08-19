---
"@aparte/core": patch
---

README fix: the npm page announced "🚧 **Pre-alpha** — not yet published to npm" —
false on the very page npm was serving, and it had been through four releases. It now
states what the package is (alpha, plain `0.x`, lockstep, API can still change) and
links the changelog.

The quick start went with it: it showed `registerDefaultRenderers()` as a required
step (the built-ins install themselves since 0.5.0-alpha.0) and stopped before the one
line that makes the retry/edit buttons appear now that they ship off. It also pointed
at the docs *sources* in the monorepo rather than at apartejs.dev.
