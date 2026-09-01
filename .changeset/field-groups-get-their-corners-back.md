---
"@aparte/core": patch
---

Field groups and the colour field get their corners back; the field family's knobs now live on `:root`.

`--aparte-field-radius` was declared on `.aparte-field` itself and read by
`.aparte-field-group` (the field's parent) and `.aparte-color` (a sibling recipe). A
custom property only inherits downwards, so both computed `border-radius: 0` — every
field group in the library rendered square (the sidebar's search, a `https://` prefix
group). Measured 0px → 9px. Thirteen field knobs (paddings, radius, textarea height,
checkbox/radio/switch/range sizes) move to `theme.css` beside the button's, where the
theming guide sends you and where every other family's knobs already are. Values are
unchanged; the elicitation panel's own overrides still win inside it.
