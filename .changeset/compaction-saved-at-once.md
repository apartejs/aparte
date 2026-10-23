---
'@aparte/core': minor
---

A compaction is now saved as soon as it is done: the conversation controller listens for `aparte-compact-done` and saves the chat it names — and, when the transcript lives in a framework store, it waits for the store's list to reach the chat before saving.

Until now nothing told the controller: the summary and the dropped turns reached storage at the next message, so a reload in between brought the long transcript back.

A binding you write for `AparteConversationController` can declare the new optional `afterRender(cb)`. The controller then saves a compaction only once the summary is in `getMessages()`, checking again after each render, up to six times. The framework components already declare it. Without it the save runs on the next microtask.
