---
'@aparte/core': patch
---

`aparte.css` is gone. Its 2573 lines of rules are ten sheets, one per family — `base`,
`shell`, `bubble`, `composer`, `segment`, `artifact`, `elicitation`, `conversation`,
`prose`, `responsive` — beside the `theme.css` that already held the tokens. The largest
is now 584 lines instead of 3160, and you open the one named after what you are changing.

The published `dist/index.css` bundles all eleven, so nothing changes for a consumer.

**The import order in `src/index.ts` is the cascade**, which is the one thing to know
before adding a sheet: `responsive` stays last because it overrides. Everything that
reads the sheets reads them in that same order.

### What was verified, and how

The families were interleaved — the composer alone sat in seven separate runs — so
unlike the token extraction this could not be proved by concatenation: rules genuinely
changed order relative to other families. A static proof turned out to have no clean
answer (a loose collision test flags 3630 pairs, a tight one 106, and reading those 106
shows every one impossible). So it was proved where it actually matters:

- **the full browser suite**, 364 tests across six frameworks and three engines, passes;
- the rule content is **identical** — 2296 significant lines, none lost, none duplicated;
- `check:derived-vars` reports the same 135 derived declarations, 6 exemptions and 982
  references as before the split;
- `gen-css-vars` reports the same 321 variables, 286 of them declared.

### Three readers went blind at once

`check:derived-vars`, `gen-css-vars` and the test helper `read-stylesheet.ts` each
located their corpus by a single **path**. The generator reported 6 declared tokens
instead of 286; three unit suites went red. All three read the whole set now, in import
order, and each carries a floor so a corpus that shrinks fails loudly instead of
quietly publishing short.

One more check earned its place: every sheet is asserted to have balanced comment
markers and braces. The split cut a multi-line comment in half — its opening left in
`segment.css`, its closing landing in `prose.css` — and that check is what finds it.
