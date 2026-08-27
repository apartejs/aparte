---
'@aparte/core': minor
---

The five accents-as-text derive from their own fill; ten hexes become one number per theme.

`--aparte-primary-ink` and its four siblings were hand-picked hexes — five in the light
block, five in the dark — each measured against THIS repo's `--aparte-bg`. They paint every
ghost, outline and soft button's label, links, the selected tab, the tool-call status and
the form error marker, so a consumer's palette got accent colours computed for someone
else's page. Same defect as the solid ink, one layer over.

Each is now the accent with its own hue and chroma kept, and its lightness forced to
`--aparte-ink-l` — the one value that has to flip with the theme (`0.40` light, `0.85`
dark). The five derivations live on the anchored layer, so an `<aparte-chat>` that sets its
own `--aparte-primary` gets a matching ink rather than the root's.

**Why forced lightness and not a mix.** Pulling the accent toward `--aparte-text` reads
well and was measured first: it holds on our palette and fails at 3.41 on a brand primary
that is already near the background, because such an accent has to move PAST the text
colour, not toward it. Setting the lightness outright has no such blind spot.

Measured across 80 combinations — 5 intents x 4 palettes (ours light, ours dark, two
invented) x 4 grounds (bg, surface-1/2/3) — the worst case is 4.80. On our own palette the
inks land between 7.12 and 12.24, against 4.60–4.63 for the hexes they replace, and each
accent keeps its character on screen: brass reads brass, danger reads red.
