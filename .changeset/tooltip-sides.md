---
"@aparte/core": patch
---

`data-side="top | bottom | start | end"` places a tooltip against its trigger — wrap the trigger in `.aparte-tooltip-anchor` — and turns the arrow to match; `--aparte-tooltip-gap` is the distance. No inline positioning needed any more.

The recipe drew the box and the arrow and left the placement to two inline styles in its own example. A demo that needs inline styles to work is a recipe with a parameter it forgot. Flipping a tooltip that would leave the viewport stays out: that needs script, and it is a positioning library's job. Without `data-side` nothing is positioned, as before.
