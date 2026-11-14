---
'@aparte/plugin-subagents': minor
---

A link in a sub-agent's conversation shown beside the chat (`<aparte-subagent-view>`) now fires the chat's cancelable `aparte-link-click`, so the listener that routes a reply's links routes it too.

- **Why.** Beside the chat the view is outside every message, so no message heard a click in it, and a same-site link a sub-agent wrote replaced the page.
- **Where.** On the chat the view reads (`for`, `chat`, or the element an app's handle names with `getElement()`), with the reply's `messageId`; a view that names no chat sends it on itself. A source the sub-agent cited goes to the chat the same way. Under a line, inside the reply, the message announces it, once. Where the link opens follows the chat's link target (`setLinkTarget`).
