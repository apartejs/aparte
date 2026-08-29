---
"@aparte/core": patch
---

A `registerStreamBlock` grammar's `toSegment` runs exactly once per tag, with prose before the tag or without — safe to count, allocate or register in.

`a <note kind="k"/>` emitted the right segments, but built them twice: the text run went out first and the tag was left in the buffer to be re-read on the next step, so a grammar that counts, allocates or registers something in `toSegment` did it a second time and threw the first result away. The tag is now consumed once and the block it built waits its turn. What comes out, and in which order, is unchanged.
