---
'@aparte/core': minor
'@aparte/locales': minor
---

`<aparte-conversation-list>` can move a conversation to another of your groups: set `moveTargets`, and each row's menu offers "Move to…" and "Remove from “…”", a row can be dragged onto another group, and `aparte-conversation-move` tells you where.

Nothing changes without `moveTargets`: the menu and the rows are the ones they were. Set it to the groups a conversation can go to (`[{ key, label }]`, the shape an item's `group` already has). "Move to…" lists every target but the row's own group, in the same menu and walked by its keys; "Remove from “…”" takes a row in a group out of it; a row dragged onto another group (its heading or its rows) moves there, the group marked while a drop would land, and dropped on the rows of no group it leaves its group. Each sends `aparte-conversation-move` with `{ id, from, to }` (`to` is a key, or `null` for no group), and the list moves nothing: you write it and assign `conversations` again. `manage` does not carry it out, since a group is your data. A target no row is in has no heading to drop on, so the menu reaches it. Under a wrapper, `moveTargets` is a prop or input and the event is `onConversationMove` in React, `(conversationMove)` in Angular, `aparte-conversation-move` in Vue and Svelte.

Three locale keys, in the nine languages of `@aparte/locales`: `moveConversation`, `moveConversationTo`, `removeFromGroup`. The icon provider gains `folder`, which the "Move to…" item draws; `folderIcon` is still exported from `@aparte/core/icons`.
