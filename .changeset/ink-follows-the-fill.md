---
'@aparte/core': minor
---

Every intent has a named ink, and core works it out when you do not.

**What was wrong.** `--aparte-on-intent: #14100a` was a hex chosen by measuring against
THIS repo's own intent fills, and every solid button, badge and checkbox took its label
colour from it. That made core's rendering depend on core's palette, in a library whose
premise is that consumers bring their own. The theming guide teaches an eight-line
rebrand and `<aparte-chat style="--aparte-primary: …">` and named that token in neither,
so a dark brand colour got near-black on it and no signal — **1.11:1** measured on a navy
`#1a1a2e`, **1.83:1** on slate `#334155`.

It was broken on the stock palette too. Escaping the constant needed a per-intent
exception and `--neutral` had one, a hardcoded white copied into three sheets. It was
pinned while the fill flips with the theme (`#6d6479` → `#a89bb6`), so in dark mode the
neutral solid button's label, the neutral badge's text and the neutral checkbox's
checkmark all shipped at **2.62:1**. Nothing measured it.

**The contract is now a pair per intent**, and a theme declares whichever half it has an
opinion about:

```
--aparte-primary / --aparte-on-primary        --aparte-info    / --aparte-on-info
--aparte-secondary / --aparte-on-secondary    --aparte-success / --aparte-on-success
--aparte-neutral / --aparte-on-neutral        --aparte-warning / --aparte-on-warning
--aparte-error / --aparte-on-error
```

None of the seven `--aparte-on-*` ships declared. An undeclared partner means "work it
out", and each recipe derives the ink from its own fill — keep the hue, drop the chroma
to a trace, pick lightness either side of `--aparte-ink-flip`. Declare one and it wins
for every control using that intent. The shape shadcn uses, with Bootstrap's computed
default behind it; this repo had borrowed Material's `on-*` naming and backed it with a
constant.

Measured in a browser on the built stylesheet: **42 of 42** control/intent/theme
combinations clear AA, where `neutral` in dark read 2.62. The derivation also matches or
beats the old hand-picked value on every fill this palette declares.

- **Removed:** `--aparte-on-primary`'s hardcoded `#ffffff`. The name stays as the pair
  partner — undeclared, so it derives. Its only readers were the three `--neutral` rules,
  and it was separately documented on `<aparte-composer-send>` as the send icon's colour,
  which that button never read.
- **Added:** `--aparte-ink-flip` (0.57) and `--aparte-ink-dark` (0.176) — how the computed
  default behaves, one knob each for every solid control. `--aparte-derived-ink` exposes
  the computed value itself.
- **Kept:** `--aparte-on-intent`, now only the fallback for a browser without relative
  colour syntax (Firefox before 128), reached through `@supports` — a custom property does
  not fall back on an unparsable value the way a real property does.

The theming guide now documents the pairs, which is the half that made the original defect
invisible: the mechanism existed and nothing told a consumer it was theirs to set.
