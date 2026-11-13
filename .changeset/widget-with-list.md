---
'@aparte/core': minor
---

A sidebar in the shell of an `<aparte-launcher>` card is now a drawer in that card, and `<aparte-conversation-list target="…">` drives one chat. To keep a column in the card, set `breakpoint="none"` on the sidebar.

- **A sidebar in the floating chat** followed the window's width: in a wide window it stayed a column inside a card a few hundred pixels wide, and as a drawer it opened over the page the chat floats on. As the direct child of the card's `.aparte-app-shell`, it is now a drawer in the card, its scrim covers the card, and it is a column again once the chat is maximized (not with `maximizable="panel"`, which is still narrow). Escape closes the drawer before it closes the chat, and closing the chat closes the drawer.
- **A shell as the card has the card's height.** `.aparte-app-shell` directly inside `<aparte-launcher>` was as tall as what it held; it now takes `--aparte-launcher-height`, like any other card.
- **A sidebar toggle that names no sidebar drives the one of its own shell.** `data-aparte-sidebar-toggle` in a shell's header opened the first sidebar of the page, which is not its own on a page with two shells.
- **Escape on a row's menu inside an open drawer** closes the menu and leaves the drawer open; it closed both.
- **`target` on `<aparte-conversation-list>`**: the id of the chat the list drives. A row's click then carries `targetId` in `aparte-conversation-select`, so only that chat opens the conversation; on a page with two chats, every chat used to. And `manage` acts on that chat's conversation manager, where a list beside a chat that has a configuration of its own found none.
- `AparteConversationSelectDetail` gains the optional `targetId`.
