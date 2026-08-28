---
"@aparte/core": patch
---

While a reply streams, the branch pickers and the retry/edit actions of every message are disabled, and `navigateBranch()` is a no-op — the transcript is read-only except for Stop (copy stays). Until now only the streaming message's own footer was hidden: swapping a branch on an older message re-rendered the active path under the reply being written, and a retry cut that reply off to start another. The viewport carries `data-busy` while it streams and pushes the state to its bubbles (`setTranscriptBusy()`); a bubble mounted under a framework's DOM while the flag is up reads it on connect.
