---
'@aparte/core': patch
---

Clicking a scroll-rail tick in a chat embedded in a scrolling page now scrolls only the transcript, not the page around it.

The jump used `scrollIntoView`, which aligns the message in every scrolling ancestor, the page included. In a dashboard panel or on a docs page, each tick moved the whole page and pushed the chat's own header out of view. The transcript's surface is now scrolled by the distance to the message.
