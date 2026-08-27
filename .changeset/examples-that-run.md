---
'@aparte/core': patch
---

Three elements now document themselves with markup that runs, and one no longer shows
Angular syntax in an HTML block.

`<aparte-composer>` had no `@example` at all — the only element of the eighteen without
one — so its reference page opened on an element that "renders nothing of its own, no
default children" and never showed the markup that makes it a composer. It has the
canonical shell/row/input/send now.

`<aparte-chat-viewport>` and `<aparte-conversation-list>` documented themselves only
through an imperative TypeScript example. Both are elements you place in markup and then
drive, so each gains an HTML example that does both: the tag, then a short script that
seeds it. The TypeScript examples stay — they were not the problem, they were half the
answer.

`<aparte-composer-action>`'s example was `(click)="onFavourite()"` inside a block the
reference renders as HTML. That is Angular's binding syntax, valid in exactly one of the
five framework targets and invalid HTML in all of them; the element's real event is
`aparte-action-click`, and it bubbles, so the example now listens for it the way any
framework-free page would. It also sits inside an `<aparte-composer>` now, because the
element resolves its context with `closest('aparte-composer')` and does nothing outside
one.

These examples are what the documentation site's live preview renders, so an example
that stops working is now a visibly broken demo rather than prose no one re-reads. That
caught one on the way in: a script calling `viewport.appendMessage()` immediately after
the tag runs before the element is upgraded, and threw.
