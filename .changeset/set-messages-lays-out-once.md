---
"@aparte/core": patch
---

`setMessages` draws a long conversation several times faster: 500 messages took 2.8 s and now take under 0.4 s in Chromium.

Each message the call appended measured the transcript's bottom spacer, and each person's message started a smooth scroll; both forced a layout of the whole transcript, once per message. The call now appends every message and does that work once, at the end. A conversation set whole still ends scrolled to its last message, without gliding through every turn on the way.
