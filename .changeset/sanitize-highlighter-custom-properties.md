---
'@aparte/core': patch
---

**A syntax highlighter's dual-theme output is no longer thrown away.** The default
sanitizer's inline-style allowlist had entries for `color`, `background-color` and the
font properties, and none for a custom property — so shiki's documented light-and-dark
mode, `defaultColor: false`, which emits **only** `--shiki-light` / `--shiki-dark` and
leaves the choosing to CSS, lost every declaration and rendered every code block white.
The feature was unreachable, not merely unstyled.

A custom property is now kept, with two rules:

- **The value scrubbing is unchanged.** A custom property is inert until some CSS reads
  it, so the value is what has to be safe: `url()`, `expression()`, `javascript:`, a CSS
  identifier escape and `<>` are refused exactly as before.
- **Our own namespace is refused.** `--aparte-*` is dropped. Core's entire theme is
  custom properties, so a model-authored block setting `--aparte-primary` would repaint
  the chat around itself — not highlighting, defacement with our own paint.

If you were working around this by pinning a single shiki theme, you can stop.
