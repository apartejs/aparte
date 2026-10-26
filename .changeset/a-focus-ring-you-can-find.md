---
"@aparte/core": minor
---

The keyboard focus ring is now 2px wide with a 2px gap, instead of 1px flush against the control. For the old ring, set `:root { --aparte-focus-outline-width: 1px; --aparte-focus-outline-offset: 0px; }`.

2px is the thickness WCAG 2.2 asks of a focus indicator (2.4.13). The ring keeps its neutral colour, which is what kept a page full of focusable controls from looking framed. Measured on every component and template page of the docs, focused as a keyboard would: no ring there was newly cut by the gap. One control that appears only once a file is attached was — a pending file's ✕, inside a tile that clips — and it now draws its ring inside, like the picture beside it.
