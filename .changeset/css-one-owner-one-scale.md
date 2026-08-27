---
'@aparte/core': minor
---

The stylesheet becomes a token system: one owner per value, and three masters that
actually move the whole scale.

**The scale now derives.** `--aparte-space-unit`, `--aparte-radius-unit` and
`--aparte-font-scale` are new, and every step is computed from one of them
(`--aparte-space-4` is `calc(var(--aparte-space-unit) * 4)`). Before, each step was a
literal, so there was no single value to move. Measured after the change: of 265
pre-existing tokens, resolved on a real property in a browser, in both themes,
exactly one resolves differently — the deliberate rename below. The rest land on the
same pixel.

**Type is in `rem`.** The font-size scale was px, so it ignored the reader's browser
font size — the one accessibility setting a chat has to honour. At the default 16px
root nothing changes; at any other setting the chat now scales with the page.
`--aparte-font-scale` multiplies the whole ramp for an app that wants it smaller or
larger without restating six values.

**One owner per value.** 471 `var(--x, fallback)` fallbacks were removed, of 521. A fallback
only applies when the token is undeclared, and `src/index.ts` imports every stylesheet
core ships — so those fallbacks never applied. They only drifted: in the theme sheet alone, **155 of them
contradicted the declared value**, `--aparte-border` carrying eleven different
fallbacks and `--aparte-primary` falling back to an indigo the palette had left. The
worst were nested inside `select.css`, where dark literals (`#1e293b`, `#334155`) sat
on the light path. The 18 tokens core never declares keep their fallback: there the
fallback IS the owner, which is the "unset by default" knob.

**Motion is tokenised.** `--aparte-duration-fast|base|slow|slower|spin|pulse`,
`--aparte-ease` and `--aparte-slide-distance`. 48 hardcoded durations across 27 rules
read them now. `prefers-reduced-motion` overrides the tokens rather than sweeping
selectors, which closes a real hole: two hand-written patches existed because the old
sweep matched only DESCENDANTS of core's elements, never the elements themselves.

**Windows high contrast.** In `forced-colors` mode the UA drops `box-shadow`, so the
two focus indicators built on `--aparte-focus-ring`, and the error ring on an avatar,
did not change colour — they vanished. They are restated as outlines.

New tokens: `--aparte-z-raised`, `--aparte-z-dropdown`, `--aparte-z-floating` (a host
can now lift its own modal over the scroll button), `--aparte-focus-outline-offset`,
`--aparte-avatar-error-ring`, `--aparte-select-shadow`, and twelve component sizes that
were magic numbers in a rule.

### Breaking for themes

| before | after |
| --- | --- |
| `--aparte-select-min-width` (120px, styled `.aparte-model-select`) | `--aparte-model-select-min-width` |
| `--aparte-select-min-width` | now means `<aparte-select>`, 200px |

The name pointed at the wrong widget, next to a `<aparte-select>` it did not control.

### Visible changes, on purpose

- **The `<aparte-select>` focus ring follows the theme.** It was a second, diverged
  implementation hardcoded to Tailwind blue `rgba(59,130,246,.2)`; it now uses
  `--aparte-focus-ring` like every other focus ring, so it is brass in the default
  theme instead of blue.
- **The select dropdown has a shadow in dark mode.** Its shadow lived as a fallback,
  so it had no dark value at all, and `rgba(0,0,0,.1)` over a dark surface is no
  shadow.
- **Six off-scale values moved by 1px** to land on the spacing scale (a 7px gap to
  8px, a 3px padding to 4px, and so on).
- **The select spinner turns at 0.7s instead of 0.6s**, joining the one rotation speed
  the sheet already named.

