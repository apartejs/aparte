---
'@aparte/core': patch
---

One rotation, and every stylesheet in one place.

The library had four keyframes for a 360° turn: `aparte-spinner-spin`,
`aparte-spin` and `aparte-icon-spin` were byte-identical, and `tool-spin` was used by
nothing at all — and, being unprefixed, could have shadowed a rule of the same name on
your own page. There is one now, `aparte-spin`, next to `aparte-pulse` in `base.css`
where they are used. `aparte-spinner-rotate` stays separate on purpose: it starts at
-90° because an SVG arc's zero is at three o'clock, so it is a different curve rather
than a differently-named copy.

`select.css` and `progress-spinner.css` move from `src/primitives/*/` into
`src/styles/primitives/`, where every other sheet lives. No selector they carry appears
in any other sheet, and their rendering is unchanged — measured before and after.

`check:derived-vars` gained two rules, both sabotage-verified: every `animation` names
a keyframe that exists (nothing declared `aparte-icon-spin`, so core's loading icon
simply sat still, with no error anywhere), none is declared twice, none is dead, and all
are prefixed. And `styles/bundle.css` — the source variant of the `./styles.css` export,
the one list that cannot derive itself because a bundler reads it — must match
`src/index.ts` import for import. It had already fallen a sheet behind.
