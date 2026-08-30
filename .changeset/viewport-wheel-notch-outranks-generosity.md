---
'@aparte/core': patch
---

Scrolling up during a streaming reply now works on WebKit. A wheel notch moves Safari about 33px at a time, and the viewport's bottom threshold is 50px — so each notch read as "still at the bottom", the follow stayed armed, and the settle chain put the reader back one millisecond later. Twelve notches, same position. Nothing to change on your side.

The threshold's generosity is right and stays: a few pixels of layout drift must not read as "the reader walked away". What was missing is that it outranked the reader. `_readerInputAt` — the wheel, touchmove, a navigation key, a press in the scrollbar gutter — already tells a gesture from drift, and the settle logic already trusted it; the arming side did not consult it. It does now, so a decrease with a hand on it disarms whatever its size, while the same 33px with no gesture behind it is still drift and still keeps the follow.

Measured from CI's own timestamped scroll log: wheel at 135ms, the reader at 565, `scrollTop = 598` written back at 155ms, repeat.
