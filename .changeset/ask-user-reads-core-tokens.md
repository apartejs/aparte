---
'@aparte/plugin-ask-user': patch
---

The question receipt's stylesheet reads core's tokens instead of its own magic
numbers: spacing on `--aparte-space-*`, its hairline on `--aparte-border-width`, and
its appear animation on `--aparte-duration-slow`.

A plugin's CSS lives in a template literal because it cannot edit core's stylesheet —
but that is a reason to reference the theme's tokens, not to restate their values. The
receipt now follows a consumer who moves `--aparte-space-unit`, and stops at
`prefers-reduced-motion` because the duration it reads is overridden there. No API
change.
