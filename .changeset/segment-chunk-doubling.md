---
"@aparte/core": patch
---

**Fix: streaming a segment with `appendToSegment` wrote every chunk twice** — in the
message model and on screen ("BonjourBonjour le le monde"), which shows up as a word
appearing twice as the reply streams in.

One object, two writers. `addSegment` hands the **same segment object** to the
message model and to the bubble, and `appendToSegment` then advances it from both
ends: the viewport appended the chunk in place, and the bubble — holding that very
object — appended it again. On the framework-managed path a third writer joined in,
the coalesced once-per-frame state sync, which added the chunk on top of content
that already had it.

Both sides now own the value they advance: the viewport **replaces** the segment
instead of mutating it, and the per-frame sync writes an **absolute** target
(captured before the paint) rather than a delta. Same two writes, same single
render per frame — no shared mutable state between them.

Why no test caught it: `AparteClient` never calls `appendToSegment`. It writes
segment text with `updateSegment` (absolute content), so every path our own examples
and browser suite exercise went around this one — `appendToSegment` is the API a
caller driving its own loop uses. Its only unit coverage ran against a *mocked*
viewport, and a paint that writes nothing cannot double-count. The regression tests
added here drive the real viewport and the real bubble, on both the raw-core and the
framework-managed path, and assert exact text rather than a substring — the weakness
that also let the browser suite stay green.
