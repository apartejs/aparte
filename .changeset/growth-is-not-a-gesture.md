---
'@aparte/core': patch
---

Auto-follow no longer switches itself off because the content grew.

`_handleScroll` assigned `_isAutoScrollEnabled = _isAtBottom()` on every scroll event, and
`_isAtBottom()` answers "no" for two unrelated reasons: the reader moved up, or the content
grew under them. The second disarmed the follow exactly when it was needed — a rebuild
settles its height in stages, one stage fires a scroll event while the distance is briefly
large, and the follow meant to keep the reader at the bottom had already switched off.

They are told apart by POSITION now, which is what the note in that handler asked for and
what an event counter could not do: growth does not move `scrollTop`, a reader going up
does. A decrease disarms, the bottom re-arms, everything else leaves the flag alone.

Five tests, with the geometry stubbed rather than laid out, because the case that matters
is a swap between branches of different heights — including the shorter one, where the
engine clamps `scrollTop` and the decrease is not a gesture at all.
