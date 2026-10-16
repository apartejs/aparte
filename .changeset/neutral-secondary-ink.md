---
'@aparte/core': patch
---

Neutral and secondary buttons draw their label in a darker ink on the ghost, outline and soft fills, so they meet AA contrast.

They were the two intents without an ink of their own, so their label read the fill colour: 4.19:1 for the neutral soft button, and 2.71:1 for secondary text on the page, against the 4.5:1 AA asks. They now derive `--aparte-neutral-ink` and `--aparte-secondary-ink` the way the five accents derive theirs; the neutral soft button measures 6.99:1 in light and 9.1:1 in dark. A button that sets only `--aparte-btn-intent` is unchanged.
