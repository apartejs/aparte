---
"@aparte/engine": patch
---

A Stop stays a Stop when the transport's iterator throws on the way out, however it throws. Nothing to change on your side.

Settling the iterator was guarded with `.catch()`, which only ever sees a rejected promise. A hand-written iterator — the likely shape when a host drives `runStreamAgent` with a transport of its own — throws synchronously, before there is a promise to reject, and one whose `return()` gives a plain object has no `.catch` at all. Either way the deliberate stop came back to the caller as a thrown run error, and core paints an error card over the reply the user had just stopped.

Both settle sites (the abort bail and the per-turn `finally`) now use `try`/`catch`, which covers all three shapes.
