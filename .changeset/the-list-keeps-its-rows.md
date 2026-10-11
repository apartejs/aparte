---
"@aparte/core": patch
---

Fixed: clicking a conversation in `<aparte-conversation-list>` while the list re-rendered (a save had just moved a row) could do nothing. The list now waits until the click has landed before it redraws.

A row replaced between the press and the release lost its click. Chromium sent the click to the list, where nothing handled it, and WebKit sent none. While a pointer is down on the list, a new `conversations` or any other change is held and drawn once, right after the click. Keeping the row node would not have been enough: a row moved to its new place leaves the document on the way, and the moving row is often the one pressed.
