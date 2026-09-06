---
"@aparte/core": patch
---

Sending, retrying and editing, the menus and their keyboard, the sidebar toggle, the split panes and the selects now work when you mount a chat inside your own shadow root. Nothing to change on your side.

**The send.** `AparteClient` resolves the chat a send belongs to by lookup — the id the composer names, then a walk up from the event, then a scan of the page — and all three read the document, which cannot see into a shadow tree. A chat mounted in one therefore had its send dropped with a warning; and on a page that also holds a chat in the light DOM, the scan answered with that one, so the person's message AND the model's reply appeared in a transcript they never typed into. The lookup now searches the tree the gesture came from first (`composedPath()`), then the document, and the walk crosses the boundary instead of stopping at the shadow host. `aparte-retry` and `aparte-edit` share that resolver, so they went the same way and are fixed with it. If you worked around this with `targetResolver`, it also takes the `<aparte-chat>` shell now — it used to require the element itself to expose `appendMessage`, so `targetResolver: () => root.querySelector('aparte-chat')`, the obvious call, was rejected.

**Four handlers listen on `document`** — the conversation row menu's outside-press, `[data-aparte-sidebar-toggle]`, `[data-aparte-split-pane]` and the select's close-on-outside-click. An event that leaves a shadow tree is retargeted, so `event.target` read as the shadow HOST, and each of the four asked "was this inside me?" of the wrong element and got no. The row menu closed on the press, so no item could be chosen; the sidebar toggle and the pane buttons did nothing; a select shut its own dropdown on the click that opened it. All four now read `composedPath()`, which names the node that was actually hit.

**Two lookups went the same way.** A toggle or a pane button that names no element resolves the one beside it, and it did that through `document.querySelector`, which cannot see into a shadow tree: it found nothing, or found the sidebar you also have in the light DOM. Both now look in the control's own tree first.

**`document.activeElement` retargets for the same reason**, so "which item holds the focus?" answered nothing for every element in the tree. The drawer's Tab trap and the select's "is the caret in the filter field?" already read the focus from the tree they are in; the conversation row menu's arrow keys, the focus a re-render of the rows puts back, and the scroll rail's arrow keys now do too — `pin` was unreachable by keyboard, the keyboard landed on `<body>` after a rename or a delete, and the rail's arrows were a silent no-op.

Only the behaviour crossed badly. The stylesheet already declared its tokens on `:host` for this arrangement, and that half worked.
