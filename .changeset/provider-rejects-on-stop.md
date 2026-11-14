---
'@aparte/engine': patch
---

A provider whose stream rejects when the run is stopped now ends the run as stopped (`run-aborted`, then `run-done`) instead of rejecting `runStreamAgent`. Nothing to change in your code.

A provider reading a fetch on the run's signal does not always close quietly on a Stop: the read the loop is parked on rejects, with an `AbortError` or whatever the cut socket says. The loop let that rejection out, so a deliberate Stop reached the caller as a failure, and a chat painted an error over the reply its reader had just stopped. It is decided by the signal now, as the run's end already was: once it aborted, the run ends exactly as for a quiet close, a call still running told it was stopped. A provider that fails while nobody stopped the run still fails it.
