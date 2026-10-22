---
'@aparte/core': minor
---

`--aparte-message-content-text-user` and `--aparte-message-content-text-assistant` now colour the message's words; without them the words keep `--aparte-content-color`. If you set either token, check that colour: it used to stop at the box and never reach the text.

The text and the segments inside a message each paint `--aparte-content-color`, so an ink set on the box around them reached no word — a skin with white words on a blue bubble had to scope `--aparte-content-color` on the message instead (that still works). Both tokens are now undeclared by default; the message hands its role's token to the text and the segments as `--aparte-message-ink`, which they read with `var(--aparte-content-color)` as fallback. So a content colour set anywhere, one message included, reaches the words while no role token is set, and a rule of your own on `.aparte-content` keeps the weight it had and still wins.
