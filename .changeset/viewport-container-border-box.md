---
"@aparte/core": patch
---

In core mode with `overlay-composer`, the transcript's scroll surface no longer overruns its host by the composer inset. `.aparte-viewport-container` is `height: 100%` and carries the overlay clearance as `padding-bottom`; without `box-sizing: border-box` the padding was added to the height, so the surface stood the whole inset taller than the viewport, clipped — that much scrollbar and content cut off at the bottom. Hosts with a global `* { box-sizing: border-box }` reset (every example app in this repo) never saw it; a page without one did. The box declares its own sizing now.
