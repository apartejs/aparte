---
'@aparte/core': patch
---

A configuration change (a language switch, a theme) on a long transcript no longer stalls the page: on 200 messages it took ~125ms in Chromium, now ~15ms. Declare `--aparte-avatar-image-user` / `-assistant` on `:root`, the chat or `aparte-chat-bubble`; a declaration on `.aparte-avatar` alone is no longer read.

Every message read its role's avatar token on each change to decide whether to show the picture. It read it inside the message, which a message off screen does not style (`content-visibility: auto`), so each read paid a style pass of its own, and each mark it set dirtied the style the next read needed. The token is now read on the message element, and every message reads before any marks.
