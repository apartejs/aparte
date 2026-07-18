---
"@aparte/core": patch
"@aparte/angular": patch
---

Teardown + sanitizer hardening from the audit:

- **core `AparteChatHost.streamTokens`** now races each `next()` against the abort signal and
  calls `iterator.return()` on abort. An idle token source (notably the Angular
  Observable→AsyncIterable adapter parked on a pending `next()`) previously left the loop and the
  underlying subscription alive after `stopTokenStream()`; it now unwinds and cleans up promptly.
  Fixes the zombie-subscription leak for every wrapper. Regression test added.
- **`@aparte/angular`** `AparteChatComponent` now unsubscribes its `bubbleRefs.changes`
  subscription in `ngOnDestroy` (previously leaked one live subscription per mount across SPA
  route churn).
- **core sanitizer** drops the legacy `name` attribute from `<a>` — obsolete and a DOM-clobbering
  vector (`id`/`style` kept: they carry legitimate aria/anchor/highlight uses; a property-level
  `style` allowlist is a separate pass).
