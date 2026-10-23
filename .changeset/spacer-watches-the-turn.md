---
'@aparte/core': patch
---

A sent question is pinned under the top edge (or under `--aparte-top-inset`) every time, not now and then a third of the way down the view.

The bottom spacer measures the last question and its reply to make room for the pin. A message that has never been on screen is laid out at a 320px estimate (`content-visibility: auto`) until it is shown, and the spacer was sized from those estimates; when the messages came into view at their real height, nothing re-measured it. The viewport now watches the height of the messages it measures.
