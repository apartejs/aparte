---
'@aparte/core': patch
---

Enter opens a closed `<aparte-select>` from the keyboard, and ArrowDown opens it on the selected option; neither chooses anything on the way.

The keydown that opened the list went on up to the select's own key handler, which found the list open with the selection active: Enter chose it again and closed the list at once, firing `aparte-select-change` with the same value, and ArrowDown moved one past it. Only Space opened a select. Also, an Escape typed while the focus is on the page, the list open inside a drawer, now closes the list and leaves the drawer open: the select hears that key before any listener on the page.
