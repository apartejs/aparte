---
'@aparte/core': patch
---

A reply that ends while the transcript is re-laid out no longer leaves the view stopped short of the bottom with a scroll-to-bottom button over a reader who never scrolled (seen in Safari/WebKit, mostly under load).

When the transcript got shorter between two scroll events, the browser moved the scroll position down to the new end, and the viewport took that for the reader scrolling up: it stopped following, and the content that grew back stayed below the fold. A shorter transcript is now always the layout's doing, never the reader's; a jump that does not shorten it (a host's `scrollTo`, find in page) still counts as the reader's.
