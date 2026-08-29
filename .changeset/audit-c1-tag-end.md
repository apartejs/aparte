---
"@aparte/core": patch
---

A stream block whose attribute value contains `>` (`title="v1 -> v2"`) now keeps its attributes instead of losing them all and leaking the raw tag into the body.

The opening tag was cut at the first `>` in the buffer, wherever it fell. `<note kind="a>b" title="t > u">` therefore ended after `a`, so no attribute parsed (`kind` fell back to the grammar's default) and `b" title="t > u">` was streamed into the segment's content as literal markup. The tag now ends at the first `>` outside a quoted value; a quote only opens after an `=`, so a stray `"` written in prose or in an attribute-less tag cannot hold the buffer open, and an opening tag still incomplete at a chunk boundary is held for the next chunk exactly as before.

One malformed shape reads differently: a quote the model opens and never closes. Its value now runs to the end of the line, so the tag is read at its first `>` once the line ends rather than as soon as that `>` arrives. If the reply never breaks a line after such a tag, the tag and everything after it arrive as one plain-text run when the reply ends, instead of opening a block with a truncated attribute.
