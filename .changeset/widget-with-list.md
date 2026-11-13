---
'@aparte/core': minor
---

A sidebar inside `<aparte-launcher>` is now a drawer in the chat's card, and `<aparte-conversation-list target="…">` drives one chat. Nothing to change unless you had worked around either.

- **A sidebar in the floating chat** followed the window's width: in a wide window it stayed a column inside a card a few hundred pixels wide, and as a drawer it opened over the page the chat floats on. It is now a drawer in the card, its scrim covers the card, and it is a column again once the chat is maximized (not with `maximizable="panel"`, which is still narrow). `breakpoint="none"` keeps a column there too.
- **`target` on `<aparte-conversation-list>`**: the id of the chat the list drives. A row's click then carries `targetId` in `aparte-conversation-select`, so only that chat opens the conversation; on a page with two chats, every chat used to. And `manage` acts on that chat's conversation manager, where a list beside a chat that has a configuration of its own found none.
- `AparteConversationSelectDetail` gains the optional `targetId`.
