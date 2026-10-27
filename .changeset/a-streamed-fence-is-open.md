---
'@aparte/core': patch
---

A fenced code block still arriving now carries `isStreaming: true`, so it is coloured line by line as it streams; a custom `code` renderer sees the flag too.

The parser marked a registered block as streaming but never a fence, and the code renderer read the missing flag as finished: the whole-content highlight ran again on every token, and the progressive path built for a streaming fence never ran. With the flag set, two highlight passes can be in flight at once, so the settled one now takes precedence over a streaming one that lands late, and of two settled highlights the newer wins.

The copy button on a code block copies the block's source, rather than the text the pane happens to show.
