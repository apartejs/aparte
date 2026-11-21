---
'@aparte/core': patch
---

The server handler keeps a failed sub-agent's error text on the server: the page reads "The sub-agent failed.", and the real message goes to the server's log.

A sub-agent that failed on a server tool's error (a path, a connection string) or on its model's (a vendor message that can echo a key) ended with that text in `agent-end`'s `error`, which went out as it was: the page drew it on the sub-agent's line and the conversation saved it. A tool's own failure was already masked this way; the sub-agent's end now is too.
