---
'@aparte/core': patch
'@aparte/plugin-titler': patch
---

Four doc comments now say what the code does: the auto-compact rule, the titler's default word count, the bubble's `timestamp`, and the composer's internal bus.

- `<aparte-context auto-compact>` asks for a compaction on each turn that ends in `danger`, one request at a time, not once per crossing.
- `setupTitler`'s `budget`, omitted, does not mean six words: the model keeps, among its six best-scored words, those it is at least half sure of, never fewer than three, and every word of a message of four words or fewer.
- The bubble's `timestamp` attribute no longer names a private method.
- The composer's `_on` / `_emit` are marked `@internal` and leave the generated reference; from outside, listen for `aparte-composer-change`.
