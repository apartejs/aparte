---
'@aparte/core': patch
---

A dialog opener or closer made of a web component (a Shoelace or Material button, or a button holding an icon component) opens and closes its dialog again.

Since the dialog wiring learned to work inside an app's shadow root, it read the click from where it began and looked for the control with `closest()`, which stops at the edge of the shadow root it starts in: a click on the label or the icon of a component button, each in the component's own shadow root, found no opener. The control is now looked for along the click's whole path, across every shadow root it crossed.
