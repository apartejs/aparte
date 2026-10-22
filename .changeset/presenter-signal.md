---
'@aparte/core': patch
---

A custom elicitation presenter no longer has to honour `request.signal` itself: a stop now rejects the request with an `AparteElicitationAbortError` whatever the presenter does. Listen to the signal only to take your own UI down.

The config checked the signal only before calling the presenter, so one that never listened to it left the stopped turn waiting on a panel nobody would answer.
