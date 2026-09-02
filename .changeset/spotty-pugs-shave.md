---
"@aparte/core": patch
---

Renaming a conversation now keeps the focus on the row when you leave the field by Tab or by clicking away, not only on Enter.

Every exit re-renders the list, so the field the reader was typing in stops existing. Enter and Escape put the row's title button back under the keyboard; the blur path passed a hard-coded `false` and left the focus on `<body>`, so the next Tab restarted at the top of the page. It now looks at where the focus is going: nowhere, or somewhere inside the list this render is about to destroy, and the row takes it back — a live control outside the list keeps it, since pulling it back from there would be theft.

The restore also moved after the `aparte-rename-conversation` event rather than before it. A host that re-assigns `conversations` when it hears that event re-renders the list, which destroyed the button that had just been focused — so even Enter lost the row in the one integration that matters most.
