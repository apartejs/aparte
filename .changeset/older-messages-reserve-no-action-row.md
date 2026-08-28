---
"@aparte/core": minor
---

Older messages no longer reserve a row for their action bar: the bar floats over the message's header row on hover or focus, as a small bordered toolbar, and the transcript tightens by 34px per turn. Three bars stay in the flow as before — the last assistant message's (always visible under the reply), a message's whose branch picker is showing (the bubble now stamps `data-branches` on `.aparte-message` while it does), and every bar on a device that cannot hover, where the bar is now also visible instead of sitting at opacity 0 with nothing able to reveal it. A stylesheet that positioned `.aparte-footer` or styled `.aparte-action-bar` for older messages should be checked against the new `@media (hover: hover)` rules in `bubble.css`.

Measured on the vanilla example: 103px between the text of one turn and the next, 34 of them this footer under every message. The bar floats inside the message box rather than below it because a bubble is a paint-containment boundary (`content-visibility`), which clips anything outside.
