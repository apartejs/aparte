---
'@aparte/core': minor
---

New `--aparte-message-content-padding-assistant` token pads the assistant's box, `0` by default; a skin giving the assistant a bubble sets it instead of writing a selector for the padding.

`--aparte-message-content-padding` pads the user's box only. The new rule weighs nothing, so a padding you already give `.aparte-message-content` still reaches the assistant's box. The Theme guide's "Give the assistant a bubble too" recipe now sets the two tokens and keeps one rule, for `width: fit-content`.
