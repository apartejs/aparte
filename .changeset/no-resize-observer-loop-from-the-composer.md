---
'@aparte/core': patch
---

Resizing the window or the chat no longer raises "ResizeObserver loop completed with undelivered notifications" from the composer.

The editor set its own height inside the observer that watches it, so each width change (a window resize, the launcher maximized, the drawer toggled) ended in that browser error, which monitors log for every user and dev servers show full screen. The height is now set on the next frame, and only when the width changed.
