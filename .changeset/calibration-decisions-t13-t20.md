---
"@aparte/core": patch
---

Five calibration decisions from the image audit: the bubble's corner is the theme's `--aparte-radius-bubble` (12px, it was a 14px literal); a control's edge has its own token, `--aparte-border-control`, read by the field, the field group, the choice controls and the select trigger; the icon scale is in rem on the type factor (`--aparte-icon-size` defaults to 1rem, was 14px; sm 0.75rem, lg 1.125rem, xl 1.25rem); the elicitation rows' radius is the md step; and a disabled button, field or select is drawn — a neutral ground and the muted ink — instead of faded with opacity. The composer's gated state no longer fades the whole composer.

`--aparte-border` did two jobs, separating regions and bounding controls, and six previews showed a control with no visible edge; the new token is derived from the ink and the ground so both schemes follow, and its mix is a first setting. The icon scale was the one scale in the theme pinned in px while every type size followed `--aparte-font-scale`, so a glyph beside text shrank optically when the reader enlarged the text. Opacity on a disabled control faded the glyph with its ground and read at 2:1 on the send button; "inactive" and "disappearing" are not the same message. Menu items, option rows and a tag's ✕ keep the opacity for now.
