---
'@aparte/plugin-artifacts': minor
---

A link in the document `<aparte-artifact-panel>` shows now fires the chat's cancelable `aparte-link-click`, so the listener that routes a reply's links routes it too.

- **Why.** The panel sits beside the chat, outside every message, so no message heard a click in it, and a same-site link in a document the model wrote replaced the page.
- **Where.** On the chat the panel reads (`for`, `chat`, or the element an app's handle names with `getElement()`), with `{ href, anchor, messageId }`; a panel that names no chat sends it on itself. A link of yours in the header is yours, and is not announced. Where the link opens follows the chat's link target (`setLinkTarget`), as in the reply.
