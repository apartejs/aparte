---
"@aparte/core": patch
---

Tighten the client's typing: the four near-identical local target interfaces
(`AparteChatElement`/`RetryTarget`/`EditTarget`/`CompactTarget`) are consolidated into the
one module-level `AparteChatTargetElement`, which removes ~two dozen gratuitous
`(target as any).method` casts; the three `catch (err: any)` become `catch (err: unknown)`
with narrowing; and `(segment as any).content` reads become a typed `{ content?: string }`
cast. No behaviour change — pure typing rigor (the `as any`s were papering over methods the
element already declares). Drops the repo's `no-explicit-any` warning count from ~63 to ~39.
