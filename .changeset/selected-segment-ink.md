---
'@aparte/core': patch
---

A button with no intent class now inks like a neutral one: an intent-less `--solid` button and the selected segment of an intent-less or `--surface` group meet AA contrast.

Such a button is neutral, but it kept the dark constant ink instead of the ink derived from its fill, so its label read dark on the neutral fill at 3.38:1 in light. It now measures 5.50:1 in light (white on the fill) and 7.27:1 in dark. If you set `--aparte-btn-ink` to change that label, set `--aparte-on-neutral` instead: where relative colour syntax exists, the intent-less button no longer reads `--aparte-btn-ink`. Browsers without it keep the previous ink.
