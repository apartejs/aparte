---
"@aparte/core": patch
---

In Safari and every other WebKit browser, a framework-rendered transcript stays anchored at the bottom when a streamed reply finishes; it used to end up 80px short with the follow switched off. Nothing to change on your side, unless you had set `overflow-anchor` on the transcript yourself.

The viewport pins the reader to the bottom itself and reads a `scrollTop` decrease it did not write as the reader walking away. Whether a decrease was the reader's used to be decided by its SIZE — no larger than the height change seen at that scroll event — and WebKit's settle refutes that: between two layouts of a finishing reply it moves `scrollTop` by more than the regrown height explains (82px against 30, once 27px against nothing), one frame after the viewport's own pin. The decision now rests on the reader's hand instead: a scroll gesture leaves a trace (wheel, touch, a press in the scrollbar gutter, a scroll key), and a press on the text that drags a selection past the edge holds the pointer down while the container scrolls. No trace and no hand, within a second of the viewport's own scroll, is the layout's, and the follow stays armed and re-anchors. The browser's own scroll anchoring is also off on both scroll surfaces: a chat appends below the reader, so it protected nothing there and only fought the pin.
