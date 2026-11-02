---
"@aparte/core": patch
"@aparte/plugin-artifacts": patch
---

Right-to-left fixes: the send arrow points left, a framework chat's transcript follows a right-to-left locale, and an approval's arguments read left to right.

Found by a second right-to-left audit in a real browser (Chromium and WebKit):

- The send button's arrow points to the left in a right-to-left composer. The stop square and the submit check are not turned. The button says which act it shows (`data-act="send"`, `"submit"` or `"stop"`), and only the send glyph is mirrored, whichever icon `getIcon('send')` returns.
- With `locale.direction: 'rtl'` on a left-to-right page, a React, Vue, Svelte or Angular chat turned its composer and left its messages left to right. The transcript now turns too.
- The approval panel's arguments JSON read right to left (`}` on the first line) once the composer showed the panel. It reads left to right, like all code.
- The model's words in a question or approval panel (the question, titles, descriptions, options, step labels) and a citation's title, domain and snippet read in their own direction (`dir="auto"`), as a message does: an English question in an Arabic page read "?Which colour".
- The citation card takes the transcript's direction, and its previous and next arrows point outward.
- The context gauge's panel no longer runs off the left edge of a right-to-left page.
- A `top` or `bottom` tooltip (the `aparte-tooltip` recipe) is centred on its anchor in a right-to-left page; it sat wholly to the side.
- The arrow keys of the question panel's step tabs and of the artifact card's tabs move to the next tab in the reading direction.
- The skeleton's sweep enters at the start edge, as the shimmer's does.
