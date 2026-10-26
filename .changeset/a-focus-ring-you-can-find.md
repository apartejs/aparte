---
"@aparte/core": minor
---

The keyboard focus ring is now 2px wide with a 2px gap, instead of 1px flush against the control. For the old ring, set `:root { --aparte-focus-outline-width: 1px; --aparte-focus-outline-offset: 0px; }`.

2px is the thickness WCAG 2.2 asks of a focus indicator (2.4.13). The ring keeps its neutral colour, which is what kept a page full of focusable controls from looking framed. Measured on every component and template page of the docs: no control inside a chat has its ring cut by the 2px gap that was not already cut at 1px.
