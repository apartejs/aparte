---
'@aparte/plugin-diff': patch
---

`<aparte-diff>` no longer draws its rows again when handed the same comments or the same change; nothing to change in your code.

A framework hands `comments` and `diff` on every render, often as a new array of the same comments (`review.filter((c) => c.path === file)`) or a new `{ path, before, after }` with the same texts. Each drew every row again: what the reader was doing was carried over, but every row was a new element, so a text selection in the code was lost and the field being written in left the page and came back. A list of the same comments, or a change with the same texts, now draws nothing. A comment changed in place and handed back is still drawn, and an app's own fields on a comment (`id`, say) do not count, since the view does not show them (#253).
