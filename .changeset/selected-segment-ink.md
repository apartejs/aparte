---
'@aparte/core': patch
---

The selected segment of a button group with no intent class, or of a `--surface` group, now meets AA contrast: its label inks like a neutral button's.

A button with no intent class is neutral, but it kept the dark constant ink instead of the ink derived from its fill, so a selected segment read dark on the neutral fill at 3.38:1 in light. It now measures 5.50:1 in light and 7.27:1 in dark. Browsers without relative colour syntax keep the previous ink.
