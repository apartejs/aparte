---
"@aparte/core": patch
---

An assistant turn that ends with nothing to show — stopped before its first token, or made only of a tool that renders nothing — no longer leaves a name and a timestamp floating in the transcript. The bubble sets `data-empty` on `.aparte-message` and the stylesheet hides the row; restyle `.aparte-message[data-empty]` if you want a "stopped" marker instead.

Streaming bubbles are never empty (the waiting dots are their content), and attachments count as content. The element stays in the DOM, so streaming and the action bar still address it by id.
