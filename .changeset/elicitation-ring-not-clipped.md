---
"@aparte/core": patch
---

A focused option in the elicitation panel keeps its whole focus ring. The options sit in a scroll container, which clips at its padding edge, and the ring is drawn outside the option's box — so a keyboard-focused option lost 4px of ring on every side (the border looked cut). The container now pads by the ring's size and takes the space back with a negative margin, in the same tokens the ring reads (`--aparte-focus-outline-width`, `--aparte-btn-focus-offset`), so nothing moves and a wider ring gets a wider room. `scroll-padding` keeps a focused option's ring in view when the list scrolls.
