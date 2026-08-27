---
'@aparte/core': patch
---

Fixed: the keyboard could not archive or delete a conversation — both keys selected it.

`<aparte-conversation-list>`'s row is a `role="button"` div, so the component supplies
Enter and Space for it. That handler climbed to `closest('[data-conv-id]')` from whatever
was focused, so a press on the Archive or Delete button inside the row found the ROW,
called `preventDefault()` — cancelling the button's own activation — and clicked the row.
Both controls were reachable by Tab and neither could be operated: WCAG 2.1.1, on the two
destructive actions in the list.

The synthetic activation now stays on the one element that has no native one. An earlier
fix had given both buttons `tabindex="0"` and a test asserting it; focusable is not
operable, and that test only ever proved the first half. It proves both now.
