---
'@aparte/plugin-ask-user': patch
---

The receipt's last two raw values read the scale: `font-weight: 600` becomes
`--aparte-font-weight-semibold` and `font-size: 0.8rem` becomes
`--aparte-font-size-md` (13px against 12.8px, so it moves 0.2px and now sits on a
step). The previous pass tokenised the receipt's spacing and duration but not its
type — the weight was still written out, which is how a plugin quietly stops
following a consumer who restyles the chat.
