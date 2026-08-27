---
'@aparte-workspace/docs': patch
---

The Reference section leads with the core JS API.

`reference/config.md` and `reference/classes.mdx` both claimed `sidebar.order: 4`, so
which came first was Starlight's alphabetical tiebreak rather than a decision. The core
API page is the one a reader arrives for; it takes slot 1.
