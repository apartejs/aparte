---
'@aparte/core': minor
'@aparte/locales': minor
---

A message written while a reply streams can wait for it: `aparteGlobalConfig.setQueueWhileStreaming(true)` makes Enter queue the draft above the field, and each queued message is sent when the reply ends (#248). Off by default.

Each queued message shows with a button to take it back into the field and one to remove it. When the reply ends well (`aparte-message-done`) the first one goes out through the same `aparte-before-send` and `aparte-send` as a message sent by hand, so a held send holds it too, and the next one waits for the reply to it. After a Stop or an error nothing is sent: what was queued comes back into the field. The Stop button stays Stop. `composer.queue()` queues from a button of your own, and the composer's state carries `queued` (`AparteQueuedMessage[]`). Three locale keys, `queueLabel`, `queueEdit` and `queueRemove`, in the nine languages.

The norm it follows: Cursor queues follow-ups typed during a run and sends them in order once it ends, each removable; Codex queues them with Tab, and with Enter in its IDE extension.
