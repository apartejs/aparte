---
'@aparte-workspace/docs': patch
---

The Reference sidebar's order has one owner instead of six.

Five of the seven Reference pages are generated, and each generator carried its own
hardcoded `sidebar.order`. Nobody could see two of them at once, so `engine.md` and
`icons.md` both claimed 3 and `wrappers.md` claimed nothing — a third of the section was
arranged by Starlight's alphabetical tiebreak rather than by a decision. The generated
pages are gitignored, so editing them was never an option either: the `gen` step runs
inside `typecheck`, which rewrites them before a commit can be made.

`apps/docs/scripts/reference-order.mjs` is now the only place that decides, and it throws
on a page it does not know rather than letting one fall back to alphabetical. The order
reads as the JS API (`config`, `events`), then the styling surface (`css-variables`,
`classes`, `icons`), then the adjacent packages (`engine`, `wrappers`).
