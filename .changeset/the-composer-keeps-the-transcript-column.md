---
'@aparte/core': patch
---

The composer no longer goes flush to the chat's edges on a container narrower than 800px — it takes the same left/right gutter as the transcript. Nothing to change on your side.

`.aparte-composer-shell` and `.aparte-message` both cap at `--aparte-message-max-width` (800px) and centre with `margin: 0 auto`, so on a wide container they lined up by construction. Below 800px the cap stops applying and each fills its own parent — and `<aparte-composer>` had no padding at all, so the composer went edge to edge while the messages kept their inset. Measured at a 512px chat: message column 26/26, composer 0/0. Every chat narrower than 800px was hit: phones, embedded widgets, either pane of `<aparte-split>`, and an app shell whose docked sidebar leaves the chat narrow on a wide window. `<aparte-composer>` now reads the transcript's own `--aparte-viewport-padding` on its inline axis.

Framework-managed viewports (React, Vue, Svelte, Angular) also stop overflowing their own chat. `<aparte-chat-viewport>` is `width: 100%`, the framework path adds padding to it, and core ships no global border-box reset — so the host was 32px wider than the chat and the chat clipped it, leaving the transcript about 16px toward the end edge. Measured on a 1500px chat: the host was 1532 wide. If your app has a global `* { box-sizing: border-box }` you never saw this; if it does not, your transcript moves back to centre.

Two things to know. Content you put directly inside `<aparte-composer>` without the `.aparte-composer-shell` wrapper now picks up the same 16px inset, the way the transcript's wrapper has always inset the messages. And the transcript reserves a scrollbar gutter that the composer cannot: on a platform with classic scrollbars the two columns still differ by that gutter (about 10px per side in Chromium) below 800px, where on a platform with overlay scrollbars — every phone — they now match exactly.
