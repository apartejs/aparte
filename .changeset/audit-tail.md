---
'@aparte/core': patch
'@aparte-workspace/docs': patch
---

The tail of the cold audit: four smaller things, each verified before it was touched.

**The streaming dot announced nothing.** The artifact card's pulse was a `<span>` with
`aria-label="Streaming"` — an ARIA-prohibited attribute on an implicit `generic` role,
dropped by Chromium and Firefox, and hardcoded English in a card whose own comment claims
every string was given a locale key. It is `role="img"` with `t('generating')` now, the
key whose documentation already says it names the waiting state.

**The reference published six overrides as defaults.** `gen-css-vars` matched `:root` with
leading whitespace, so the block nested inside `responsive.css`'s
`@media (prefers-reduced-motion: reduce)` was read as another declaration block: every
duration appeared twice, the second time claiming a default of `0.01ms`, under an
unrelated heading. Top-level only now — a nested block is an override, which is why the
dark theme's is skipped.

**`<aparte-progress-spinner>` could not be stopped.** Its rotation hardcoded `0.9s`
instead of reading `--aparte-duration-spin`, so it ignored the reduced-motion reset that
overrides that token. It turns very slightly faster now (0.7s), which is the price of
stopping when asked.

**Two guides contradicted the code.** The elicitation guide's presenter table omitted
`onSettle` — the only path by which a single-choice answer reaches you — and gave
`mode()` two values out of three, missing `'none'`. The accessibility guide, on a page
that states "where a number appears, it was counted", claimed the axe suite runs against
"all five example apps in Chromium, Firefox and WebKit"; there are seven apps, WebKit
covers five and Firefox two.
