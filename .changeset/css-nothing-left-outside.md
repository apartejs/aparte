---
'@aparte/core': minor
---

The rest of the stylesheet joins the token system — and the artifact panel starts
working in dark mode.

The previous pass tokenised spacing, radius, hairlines and motion. It left everything
else, which turned out to be **101 declarations writing a raw value on a property that
already had a family of tokens**. 75 of them are gone.

**Weights and type.** 11 raw `font-weight`s (500/600/700) where
`--aparte-font-weight-*` existed — the file's own comment claimed "no raw weights".
22 `font-size`s, all in the artifact and tool components, which had never joined the
type scale at all: nine values between `0.7rem` and `0.92rem`, none of them a step.
Each moves to its nearest step, and the largest move is **0.48px**. Four
`line-height`s land on a new `--aparte-line-height-snug` (one of them was `1.35`, so
it moves 0.8px).

**A second owner for "the code font".** Two rules carried their own monospace stack
(`'JetBrains Mono', 'Fira Code', …`) instead of `--aparte-code-font-family`, so the
artifact's code pane rendered in a different font from every other code block.

**The error panel was unreadable in dark mode.** `.aparte-art-file__error*` hardcoded
`#b91c1c` and `#7f1d1d` — dark reds — on a panel that goes dark with the theme, while
`--aparte-error-title` / `-text` / `-bg` / `-border` existed and flip correctly. They
are used now.

**Paper is named, not hardcoded.** A file preview is a document shown inside the chat,
so it stays light whatever the theme is — an intent that was already written in a
comment beside a literal `#fff`. `--aparte-art-paper-bg|text|row-alt|head-bg|head-text|border`
express it and are deliberately absent from the dark block. The file-type tiles keep
their brand gradients, now as `--aparte-art-file-icon-bg[-pdf|-docx]`.

**The prose family was half-tokenised**: sizes and weights named, margins written out.
Eight tokens complete it (`--aparte-prose-h1..h4-margin`, `-blockquote-margin`,
`-blockquote-indent`, `-hr-margin`, `-code-padding`), in `em` on purpose — the one
place where relative beats the px scale, because a heading's margin should follow its
own size.

**`select.css` was the only sheet spacing in `rem`** (`0.5rem`, `0.75rem`, `0.25rem`)
while the rest of core used the px scale. Nine declarations now use the scale;
identical at a 16px root.

Two things this pass caught in its own work. Routing a fixed-background tile to
`--aparte-text-inverse` would have put near-black lettering on a dark green tile in
dark mode, because "inverse" follows the theme and that tile does not — it has
`--aparte-art-file-icon-color` instead. And `--aparte-select-radius` ended up with two
different fallbacks, one per reference, which is a third way to own a value twice; the
guard now refuses that too, alongside the fallback-on-a-declared-token and
declared-twice rules. All three are proven by sabotage.

### Still raw, on purpose

`opacity`. Ten of its uses are `0` (show/hide), which is not a token. The rest are
seven **disabled** states carrying **five different values** — 0.3, 0.45, 0.5, 0.5,
0.55, 0.6, 0.6. That is real drift, but collapsing it is visible (a disabled branch
arrow at 0.3 nearly doubles in weight at 0.5), so it stays a design decision rather
than a sweep. `margin: 0 auto`, a `-1px` caret nudge and one `font-size: 1em` stay
literal: they are geometry and relative sizing, not design values.
