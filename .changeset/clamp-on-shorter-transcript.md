---
'@aparte/core': patch
---

A reply that ends while the transcript is re-laid out no longer leaves the view stopped short of the bottom with a scroll-to-bottom button over a reader who never scrolled (seen in Safari/WebKit, mostly under load).

If your page jumps the transcript to an earlier message itself while a reply streams, call the viewport's `setAutoScroll(false)` before the jump: the follow then stays off through the jump, smooth or not, and comes back when the reader returns to the bottom. The scroll rail does this for its own jumps. A find-in-page jump has no such hook, and may be pulled back to the bottom while a reply streams.

When the transcript got shorter between two scroll events, the browser moved the scroll position down to the new end, and the viewport took that for the reader scrolling up: it stopped following, and the content that grew back stayed below the fold. A shorter transcript is now always the layout's doing, never the reader's; a jump that does not shorten it (a host's `scrollTo`) still counts as the reader's. A jump into history that was never drawn does shorten it, as its messages take their real height — hence the call above.
