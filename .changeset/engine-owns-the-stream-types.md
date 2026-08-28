---
"@aparte/core": minor
"@aparte/engine": minor
---

`@aparte/core` now depends on `@aparte/engine` (first-party — nothing from outside `@aparte` is installed); `AparteStreamRunEvent`, `AparteStreamRunEmitter`, `AparteStreamRunOptions` and `AparteStreamRunner` are engine's `StreamRunEvent`, `StreamRunEmitter`, `StreamRunOptions` and runner shape under core's names. `@aparte/engine` no longer lists core as a peer dependency, and `createCompactionSelector` is typed structurally (`CompactableMessage`), so it takes core's messages without importing core. Nothing changes in how you call either package; `npm i @aparte/core` now also installs `@aparte/engine`.

Decision D1 of the 2026-08-28 audit. The run-event contract was hand-mirrored across a "zero-import" boundary and policed by a compile-time guard that had itself been written around the one field that broke the seam; the same tool turn corrupted the history in two different shapes, one per loop, invisible to the parity suite precisely because they differ. The direction is settled: the loop is engine's, core drives it. This is the first half — the types; the inline loop's deletion is the second.
