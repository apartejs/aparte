---
"@aparte/core": patch
---

`history: 'viewport'` now sends assistant turns a host seeded without a `status`; the whole transcript used to be dropped and the model got only the new question.

`status` is optional on `AparteMessage`, and a host that seeds a transcript — restoring a saved conversation, hydrating a server-rendered one — has no reason to invent one for turns that are already over. `_toHistoryMessages` gated on `status === 'completed'`, so with none the cutoff never advanced past the first message and every seeded turn was sliced away. Nothing in the UI showed it: the viewport still rendered the whole conversation, and only the next request was missing it.

Both gates now ask "is this still in flight?" instead: a `streaming` or `pending` turn is held back, an `error` turn is still dropped and still does not advance the cutoff, and everything else — status or no status — is history.
