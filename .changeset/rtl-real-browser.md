---
"@aparte/core": patch
---

In a right-to-left page, code, formulas and the version arrows now read the right way, and a message keeps its own direction.

Found by the first right-to-left pass in a real browser (Chromium and WebKit), then a cold review of the fix:

- Code — a block, a JSON tool input or output, the approval panel's arguments, an artifact's source, inline `code` — is laid out left to right and isolated from the sentence around it; it was laid out from the right, its trailing `;` or `{` at the start of the line.
- A formula, a diagram or a chart drawn from a code block reads left to right; a KaTeX formula came out mirrored. A card drawn from a block follows the message it is in.
- The ‹ › arrows between the versions of a reply, and a folded option group's chevron, point the right way in a right-to-left row.
- A message, a reasoning block and a conversation title take the direction of their first letter (`dir="auto"`), so an English reply in an Arabic page reads left to right with its full stop at the end. Code and drawings carry `dir="ltr"` as an attribute, so an Arabic reply that opens with `npm install` or a formula stays right to left. A title lines up with its list whatever its own direction. The input takes the direction of each line typed (`unicode-bidi: plaintext`), and an empty one keeps the page's, placeholder included.

Pinned by `e2e/tests/right-to-left.spec.ts` (vanilla, Chromium and WebKit): the message directions, a code block, a mixed Arabic reply with a formula and inline code, the version arrows, a title's direction, and the input.
