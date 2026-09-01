---
"@aparte/core": patch
---

The two spinners share one stroke, in screen pixels; a determinate ring has a visible track; every pulsing dot pulses in opacity alone, above a named floor (`--aparte-pulse-floor`); the context gauge's ring is as heavy as its bar. And the shapes that have to be seen draw themselves: `--aparte-track` is the ground of a gauge or a skeleton (derived relative to the page), the user bubble is tinted like every other mark, the scrim has a dark value, the scroll rail is as wide as its widest tick and its ticks rest in the control-edge colour. `--aparte-spinner-stroke` and `--aparte-context-ring-stroke` are gone (the rings read `--aparte-spinner-thickness` and `--aparte-progress-height`).

The SVG spinner stroked at 2.5 viewBox units — 1.67px in a 16px box, antialiased, 50 % off its CSS sibling — and its track sat at 15 % of the ink, so a determinate 62 % was the percentage of a circle nobody could see; `vector-effect: non-scaling-stroke` makes the SVG's weight the CSS ring's whatever the size. The shared pulse moved in scale as well as opacity, so a row of waiting dots changed width in a loop, and its 0.3 floor left the status dot at 1.55:1 for half of every cycle. A skeleton of one line no longer renders at 60 % of its width. The values on the new tokens are first settings; the names are the fix.
