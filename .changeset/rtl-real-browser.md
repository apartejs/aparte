---
"@aparte/core": patch
---

In a right-to-left page, code, formulas and the version arrows now read the right way, and a message keeps its own direction.

Found by the first right-to-left pass in a real browser (Chromium and WebKit), each now pinned by an e2e test:

- Code — a block, a JSON tool input, an artifact's source, inline `code` — is laid out left to right and isolated from the sentence around it; it was laid out from the right, its trailing `;` or `{` at the start of the line.
- A formula, a diagram or a chart drawn from a code block reads left to right; a KaTeX formula came out mirrored. A card (`bare`) still follows the page.
- The ‹ › arrows between the versions of a reply point to the start and the end of a right-to-left row.
- A message, a reasoning block and a conversation title take the direction of their first letter (`dir="auto"`), so an English reply in an Arabic page reads left to right with its full stop at the end. The input does the same per line (`unicode-bidi: plaintext`), and an empty one keeps the page's direction, placeholder included.
