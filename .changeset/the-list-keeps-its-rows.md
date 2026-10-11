---
"@aparte/core": patch
---

Fixed: clicking a conversation in `<aparte-conversation-list>` while the list re-rendered (a save had just moved a row) could do nothing. The list now keeps its rows instead of rebuilding them.

Rows are reconciled by id: a row that is still listed stays the same node, updated in place and moved into the new order. Before, a row replaced between the press and the release had its click retargeted by the browser to the list, where nothing handled it. This was seen on WebKit.
