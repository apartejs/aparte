---
"@aparte/angular": patch
---

Under `[(messages)]`, a message the chat appends right after one of its own changes is no longer dropped when the parent's field comes back through `[messages]`.

The chat reports a change (`messagesChange`), the two-way binding writes it into the parent's field, and the chat then appends without reporting — an optimistic assistant placeholder, or core's append right after a flush of buffered chunks (an edit, a retry). At the next change detection the parent's field came back through the input and reset the chat to the list it had reported, so the placeholder vanished and the streamed reply landed on the user's message, or nowhere. The chat now recognises its own reports that have not come back yet and keeps its list when one does — the rule React, Vue and Svelte apply — while a list you restore later is still yours.
