---
"@aparte/core": patch
---

The sidebar's collapse and the drawer's slide now animate; they used to snap.

Both transitions named `--aparte-duration-normal`, a token `theme.css` has never declared — and a `var()` that resolves to nothing invalidates the whole `transition` shorthand at computed-value time, so neither property transitioned at all. They read `--aparte-duration-slow` (the 260px fold) and `--aparte-duration-slower` (the drawer, which travels the whole column plus its shadow). Nothing else changed, so a reader who learned the snap will read the slide as new behaviour: it is the behaviour the sheet always described.

The sheet's own `@media (prefers-reduced-motion: reduce)` block goes with the fix. `responsive.css` already re-declares every duration token to `0.01ms` under that query, at the source — a second, hand-written patch for two selectors was the drift that hid the missing token in the first place.
