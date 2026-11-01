---
"@aparte/core": patch
---

A reply that ends before its conversation is created is now saved with it; it used to be lost, leaving the conversation with the question alone.

The first send creates the conversation, and the creation waits for the list to load. With a
store that answers in its own time (a server, IndexedDB), a fast reply could end while there
was no active conversation yet: the save at the end of the turn did nothing, and leaving the
conversation and opening it again showed an empty answer. The browser suites had caught it as a
flaky test on slow CI machines. Now the reply is saved as soon as the conversation exists.
