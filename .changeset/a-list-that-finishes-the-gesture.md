---
"@aparte/core": minor
---

Add `manage` to `<aparte-conversation-list>`: with a conversation manager registered, the `⋯` menu now performs delete/archive/pin/rename itself. Nothing changes without the attribute.

Registering the manager is the one line you already write for the rest of the persistence (`setConversationManager(manager)`); `manage` on the element is the second. The six listeners that forwarded rename, pin, unpin, archive, unarchive and delete to that same manager can go: each of our six example apps deleted its whole forwarding block for one attribute.

The events still fire, first, and they are now cancelable: `preventDefault()` on one takes that single gesture back and leaves the rest to the list. So a host that owns its persistence leaves `manage` off and keeps exactly the behaviour it has today, and a host that owns only one of the six can set `manage` and cancel that one. `manage` with no manager registered warns on the first gesture, naming the call to make.

Selecting a conversation is untouched: it is a load, not a write, and stays the host's — the `conversationId` binding, or the window-level `aparte-conversation-select` a bound controller hears.
