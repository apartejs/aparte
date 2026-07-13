---
"@aparte/core": minor
---

Theme every part of the chat from CSS. The message surface is now a
`.aparte-message-content` region (attachments sit above it as a sibling, the
avatar is opt-in — empty by default), and every theme value flows through a CSS
custom property: colour, spacing, font size / weight / line-height, control
sizes, radii and border widths. No hardcoded theme literals remain — only
structural geometry (`100%`, `50%` radii, the spinner stroke). New scales:
`--aparte-space-*`, `--aparte-font-size-*`, `--aparte-font-weight-*`,
`--aparte-line-height-*`.

BREAKING: the `--aparte-bubble-*` theme variables are renamed to
`--aparte-message-content-*`.
