---
"@aparte/core": minor
---

Ship clean inline-SVG default icons (copy, retry, edit, send, thumbs up/down, and
the rest) in `DEFAULT_ICON_FALLBACKS`, so the chat looks right out of the box with
no icon plugin — still zero runtime dependencies, since an inline SVG is just a
string. Override any icon via `setIconProvider` with any HTML (SVG, an icon-font
`<i>`, an emoji or an `<img>` — the value is treated as trusted markup).
