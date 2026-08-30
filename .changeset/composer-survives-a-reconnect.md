---
"@aparte/core": patch
---

Moving a chat in the DOM (into an `<aparte-split>` pane, an app shell, any reparenting) no longer disconnects the composer's wiring: the editor kept the draft in the DOM but `value` never heard of it, the send button stayed disabled with text visibly in the box, and every composer button had lost its click.

Every composer child bound its listeners inside `_render()`, behind the "DOM already there" early return, while `disconnectedCallback` removed them — so the first reconnect left them deaf. Binding is the connect's job now, in all five (`input`, `send`, `cancel`, `action`, `add-attachment`); `_render` only builds. The vanilla example's `?layout=split` and `?layout=shell` variants moved the chat exactly this way, so the bug was live on both — nothing sent a message there, which is why nothing saw it.
