---
'@aparte/core': patch
'@aparte/engine': patch
---

A reply cut by an error keeps its last words: the text the parser was holding (the end of a code block, a closing backtick) is no longer lost.

The engine flushes the call's text before it throws, and the client flushes on its error path too, for a runner of your own that does not.
