---
"@aparte/core": patch
---

While a reply streams, the transcript is read-only except for Stop and copy: the branch pickers and the retry/edit actions of every message are disabled, and `navigateBranch()` is a no-op. Until now only the streaming message's own footer was hidden: swapping a branch on an older message re-rendered the active path under the reply being written, and a retry cut that reply off to start another. The viewport carries `data-busy` while it streams and pushes the state to its bubbles (`setTranscriptBusy()`); a bubble mounted under a framework's DOM while the flag is up reads it on connect.

A stopped reply now reaches a terminal status on every path, so the flag comes down. Two paths did not settle the message: a stream stopped through the host (`stopTokenStream()` / a wrapper's stop left the viewport holding the message as streaming — it "kept what was streamed" but never finished it), and a Stop pressed before the first token arrived (while auth or an attachment was still being read). Either one left the transcript read-only for the life of the page. `clearAll()` clears the flag too.
