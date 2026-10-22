---
'@aparte/core': patch
---

The compaction notice is drawn on the muted ground, in muted small type, instead of as the user's bubble.

Its colours were properties on the box, at a weight the role's rule beat, and its size never reached the text, which sets its own. The notice now sets the tokens the message reads (`--aparte-message-content-bg-*`, `--aparte-message-content-text-*`, `--aparte-content-font-size`) on `aparte-chat-bubble[data-kind="compaction"]`, where a skin can set them too.
