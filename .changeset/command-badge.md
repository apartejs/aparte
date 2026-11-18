---
'@aparte/core': minor
'@aparte/plugin-triggers': minor
---

A `/` command and a trigger row can show a badge at the end of the row: `badge: 'Beta'`. It stays while the person filters the list.

Nothing to change in your code. `AparteCommand.badge` and `AparteTriggerItem.badge` take a short text, drawn as the kit's small badge (`.aparte-menu__badge`) before a submenu's chevron, as text. A command's `group` heading says a state only while nothing is searched, because a filtered list is ranked rather than grouped; the badge is on the row itself. `commands.override` changes it like any other field. A row drawn by your own `render` draws its own badge.
