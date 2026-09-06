---
"@aparte/core": patch
---

Core's menus, sidebar toggle, split panes and selects now work when you mount a chat inside your own shadow root. Nothing to change on your side.

Four handlers listen on `document` — the conversation row menu's outside-press, `[data-aparte-sidebar-toggle]`, `[data-aparte-split-pane]` and the select's close-on-outside-click. An event that leaves a shadow tree is retargeted, so `event.target` read as the shadow HOST, and each of the four asked "was this inside me?" of the wrong element and got no. The row menu closed on the press, so no item could be chosen; the sidebar toggle and the pane buttons did nothing; a select shut its own dropdown on the click that opened it. All four now read `composedPath()`, which names the node that was actually hit.

Two lookups went the same way. A toggle or a pane button that names no element resolves the one beside it, and it did that through `document.querySelector`, which cannot see into a shadow tree: it found nothing, or found the sidebar you also have in the light DOM. Both now look in the control's own tree first. `document.activeElement` retargets for the same reason, so the drawer's Tab trap and the select's "is the caret in the filter field?" now read the focus from the tree they are in.

Only the behaviour crossed badly. The stylesheet already declared its tokens on `:host` for this arrangement, and that half worked.
