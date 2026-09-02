---
"@aparte/core": patch
---

The sidebar drawer keeps the keyboard when its search filter hides rows: Tab wraps from the last visible control instead of walking out onto the page under the scrim.

The trap listed its stops with `querySelectorAll` and treated the DOM-last one as the end of the drawer. The drawer's own search field hides non-matching rows with `hidden`, and a hidden row's buttons hold no tab stop — so after typing one letter the "last" stop was unreachable, the wrap never fired, and Tab from the last control a reader could actually see left the drawer for the transcript underneath. Opening the drawer had the same blind spot: it focused the DOM-first control even when that one was hidden.

Both now count only what a reader can reach (`[hidden]` ancestors excluded, plus `checkVisibility()` where the browser offers it, which also catches a `display: none` from a host stylesheet).
