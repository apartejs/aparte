---
'@aparte/core': patch
---

In a chat that centres its composer while empty, the first messages no longer go up and come back when a panel opens under the composer during the slide (an approval asked by the reply's first call).

The slide gives the transcript its room back over a few hundred milliseconds. A panel opening in that moment shrank the surface below the messages, the send's glide (aimed a frame earlier at a reply bubble still counted at its placeholder height) scrolled into the gap, and the returning room brought the messages back down: 35 px up and back in 50 ms on the agent template. A transcript that will fit once that room is back now does not scroll, and gets no bottom spacer.
