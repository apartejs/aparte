---
"@aparte/core": patch
---

One focus ring for every control: a 2px outline in `--aparte-border-focus`, one spacing step OUTSIDE the box (`--aparte-focus-outline-offset` is `var(--aparte-space-1)`, it was −2px). The soft box-shadow ring (`--aparte-focus-ring`), the field's error ring token, the button's private offset and the select's `--aparte-select-ring`/`--aparte-select-border-focus` knobs are gone; an invalid field's ring takes the error colour, a field group draws the ring for the field inside it, and the select's search field is the one documented exception (its ring is inset, an outset one would be clipped by the scrolling panel).

The kit drew keyboard focus two ways — seventeen recipes with a solid outline, five with a soft wash at 30 % of the accent that measured 1.39:1 against the page, an indicator that was absent rather than weak — and four of the outlines took the control's intent colour rather than the focus colour. Inside the box, the ring sat 2px from a bordered row's edge as a second concentric line, and the next row painted over it. The forced-colors block no longer restates outlines that now exist.
