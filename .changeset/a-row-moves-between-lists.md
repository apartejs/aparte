---
'@aparte/core': minor
'@aparte/react': minor
'@aparte/vue': minor
'@aparte/svelte': minor
'@aparte/angular': minor
---

A conversation can be dragged from one `<aparte-conversation-list>` onto another: give each list the key of the group it stands for in `drop-key` (`dropKey`). The drag type is public: `APARTE_CONVERSATION_DRAG_TYPE`.

For an app that renders one `flat` list per project under headings of its own. A list's rows with no `group` are in its key's group, a row dropped on it moves there, from another list of the page or from an element of the app's own that carries the type, and a row dropped back on its own list moves nothing. A list with no rows still takes a drop. The move is the same `aparte-conversation-move`, sent by the list the row lands on, `from` the key of the list it came from. Without `drop-key`, nothing changes. (apartejs/aparte#278)
