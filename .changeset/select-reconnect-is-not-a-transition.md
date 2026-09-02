---
"@aparte/core": patch
---

Re-parenting an open `<aparte-select>` no longer fires a second `aparte-select-open` or resets the keyboard highlight: a portal, a Vue teleport or any framework move keeps the dropdown exactly where it was.

`connectedCallback` runs on every re-connect, and routing the mount-time `open` attribute through the open path made a move look like a transition — the event fired again and the highlight was re-seeded on the selected option, losing where the arrow keys had got to. Mount now only opens when the element is not already open, and `_openDropdown()` returns early when it is, so every entry into it (attribute, property, click, re-connect) is idempotent.
