---
'@aparte/core': patch
---

Three leftovers in `segment/tool-call.css` and `components/composer.css`: a
`font-size` on `.aparte-tool-state` declared a second time thirty lines below the first,
a comment pasted twice verbatim, a reference to a rule that had moved to another sheet,
and `aparte-composer-attachments` declared as two rules fifteen lines apart repeating
`display` / `flex-wrap` / `gap` at identical values. Nothing rendered differently — the
later block simply owned those properties, so editing the earlier one changed nothing.
One rule each now.
