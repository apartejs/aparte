---
"@aparte/core": patch
---

The scroll-to-bottom button leaves the tab order while it is hidden.

Hidden meant opacity 0 and no pointer events, which the keyboard cannot see: the button stayed a tab stop while invisible, so Tab landed on nothing between the transcript and the composer. With the transcript now a stop of its own, that phantom stop pushed the composer past the eighth Tab on the vanilla example — the e2e that says a keyboard user must not hunt for the editor caught it on all three engines. A hidden button carries `tabindex="-1"` and `aria-hidden="true"`; both go the moment it shows.
