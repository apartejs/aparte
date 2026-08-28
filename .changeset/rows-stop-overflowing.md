---
'@aparte/core': patch
---

Fixed: six elements overflowed their container by their own padding on a page with no
`box-sizing` reset.

`width: 100%` next to a `padding` is content-box arithmetic unless something says
otherwise, and core is light DOM — a host that never wrote `* { box-sizing: border-box }`
is not a broken host. Measured in a frame without a reset: a conversation row came out its
parent's width plus both paddings and clipped its last button by the right one, which is
how it was reported.

`.aparte-menu__item`, `.aparte-message`, `.aparte-editor`, `.aparte-tag`,
`.aparte-select-search` and `.aparte-accordion__header` now say `box-sizing: border-box`
themselves — per element, never a `*` selector, the same way the eight that already had it
are written.
