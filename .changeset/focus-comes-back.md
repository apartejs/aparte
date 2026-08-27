---
'@aparte/core': patch
---

The elicitation panel gives the focus back when it closes.

It took focus on open and never returned it, so answering a question or approving a tool
call dropped a keyboard user at the top of the document — they had to tab through the
whole page to reach the composer again. WCAG 2.2 SC 2.4.3, level A, on the
human-in-the-loop flow the library puts forward, and what the ARIA Authoring Practices
Guide requires of every dialogue-shaped pattern.

No restoration existed anywhere in core: `previousActive`, `restoreFocus`, `returnFocus`
and `document.activeElement` together returned one hit across `packages/core/src`, in
`aparte-select.ts`, for something else. The element that had the focus is now recorded
once — before either branch opens a panel — and refocused from the single `close()` that
ends both.

It does not pull the focus back if the reader has moved on. A request can settle late (an
abort, a model answering while they clicked elsewhere), and yanking them back would be the
same theft in the other direction; the check reads `document.activeElement` before
`hidePanel` removes it, because afterwards there is no way to tell.
