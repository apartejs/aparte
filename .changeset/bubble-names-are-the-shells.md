---
'@aparte/core': patch
---

A custom bubble shell keeps the accessible names it wrote itself — its root's label, its action bar's, its branch arrows' — through a language switch or any config change; the bubble refreshes only the names it wrote.

Since the message's name started following its author, every config change refreshed it, so a shell root's own `aria-label` became "Assistant response" at the first language switch, model pick or late provider; the action bar's and the arrows' labels were overwritten the same way. Also: the chat's own frame, now applied to messages drawn before its config, is redrawn in a microtask (a chat unmounting no longer redraws every message first), with the streaming Markdown parser rebound, and after an open edit closes.
