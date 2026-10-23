---
'@aparte/core': patch
---

A code block inside a text segment you build yourself (`setSegments`, a restored or a server's message) is now highlighted, like one in a streamed reply.

The streaming parser turns a fence into a `code` segment, so the text renderer never highlighted, and the bubble's own highlight pass skips a message that has segments — a fence in a hand-built text segment reached no highlighter at all. The text renderer now highlights its fences once the segment is settled, as the reasoning renderer already did.

With no highlighter set, both now leave a code block as the Markdown renderer wrote it. The reasoning renderer used to put core's bare `<pre><code>` in its place, which dropped the `language-*` class a page-level highlighter or a stylesheet looks for.
