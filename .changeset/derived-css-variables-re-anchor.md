---
'@aparte/core': minor
---

**Fixed: a derived CSS variable now follows a master you override.** Per-instance
theming works, and core's own dark theme stops painting from a palette it had left.
Visible change in dark mode — read the last section before upgrading.

A custom property is substituted where it is **declared**. 79 of core's declarations
read another variable, and all 79 lived in `:root, :host` alone — so each was computed
once against the root palette, and everything below merely inherited the result. Two
consequences, neither of which produced an error:

- **`--aparte-primary` on one `<aparte-chat>` moved the send button and nothing else.**
  The accent, the avatar, the focus ring and the radii are derived, so they kept the
  root's brass. Per-instance theming was documented and did not work.
- **`[data-aparte-theme="dark"]` overrides eight masters and re-declared none of the
  derived layer**, so dark mode kept light-substituted values. Invisible in the obvious
  place — both brasses are brass — and *not* invisible in 24 others, which had been
  papered over with hardcoded dark literals: `#1e293b`, `#334155`, `#475569`, `#94a3b8`,
  the Tailwind slate ramp, against a dark theme whose own surfaces are `#17141c` /
  `#211b28` / `#2a2333` (purple-ink). Code blocks, reasoning, the input and the
  conversation list rendered in a different colour family from the rest of the chat.
  Two owners for one value, and they had already drifted.

**What changed.** The derived layer is now its own block, declared at every anchor where
a palette can change:

```css
:root, :host, [data-aparte-theme], [data-aparte-host], aparte-chat { … }
```

Substitution re-runs there, against that element's own masters. The 24 stale dark
literals are deleted — the derivation owns those values now, so the dark block is back
to what a theme should be: **18 literal master overrides** (backgrounds, bubbles, text,
border, primary, one shadow, the error palette) and nothing else.

The literal palette deliberately stays on `:root, :host`. Widening *that* list looks
like the same fix and is not: it would re-declare the light literals on an
`<aparte-chat>` nested in a dark wrapper, where a local declaration beats the inherited
dark value, and the chat would silently go light. Both halves are now enforced by
`pnpm check:derived-vars`, with the browser half in `e2e/tests/theming.spec.ts` — jsdom
does not resolve `var()`, so no unit test can see any of this.

**Upgrading.** If you set a master (`--aparte-primary`, `--aparte-surface-*`,
`--aparte-text*`, `--aparte-border`) anywhere, more of the UI now follows it — that is
the fix. If you were compensating for the old behaviour by also setting a derived
variable by hand, drop the compensation; setting the master is enough. In dark mode,
code blocks, reasoning blocks, the composer field and the conversation list change
colour: they now derive from your dark surfaces instead of the abandoned slate values.
To keep a specific one exactly as it was, set that variable yourself — a value you
declare still wins.
