---
'@aparte/plugin-ask-user': patch
---

The question on an answered receipt is drawn in the neutral ink, so it meets AA contrast on its success tint.

It used the muted text colour, which measured 4.29:1 on the success mark against the 4.5:1 AA asks. It now reads `--aparte-neutral-ink`, which measures 7.17:1 in light and 8.56:1 in dark, and keeps the muted colour with a core that does not declare that token.
