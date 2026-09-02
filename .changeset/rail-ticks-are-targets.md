---
"@aparte/core": patch
---

Scroll-rail ticks are 24px click targets on a 24px pitch. `--aparte-scroll-rail-hit-size` is the new knob and `--aparte-scroll-rail-gap` now derives from it, so fewer ticks fit in the rail before it clips.

A tick is a `<button>` that jumps the transcript, and it was drawn as the line it stands for: the pressable zone measured 22×10 CSS px on a 10px pitch, under WCAG 2.5.8's 24×24 minimum with no spacing exemption to fall back on (the exemption is measured on a 24px circle per target, and at a 10px pitch the neighbours' circles overlap). The rail hides entirely under `(pointer: coarse)`, so the bar is 2.5.8's 24px rather than 2.5.5's 44px.

Growing only the pseudo-element would have satisfied the letter of the rule and made mis-hits worse — two 24px zones on a 10px pitch overlap by 14px, and the z-order then decides every press — so the pitch rises with the zone: `--aparte-scroll-rail-gap` is `hit − thickness`, which makes gap + thickness exactly the pitch and the zones tile edge to edge.

What to change if you had tuned these: set `--aparte-scroll-rail-hit-size` rather than `--aparte-scroll-rail-gap`, since the gap now follows it. `--aparte-scroll-rail-width` takes the hit size as a floor (`max(…)`) because the rail clips: a narrower column cut the zone back on the very edge a reader aims at. The drawn line is unchanged at 14×2.
