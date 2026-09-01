---
"@aparte/core": patch
---

The error segment wears the alert recipe's parts (`aparte-alert__icon`, `__body`, `__title`, `__message`; its details block is `aparte-segment-error__details`), a card's body folds its content's outer margins into its padding, and the overlaid composer casts a shadow (`--aparte-composer-overlay-shadow`).

Also: `hidden` now hides any element wearing an `aparte-` class — a recipe's own `display` used to outrank the browser's `[hidden]`, so a hidden button stayed painted (the copy button of a tool-only turn, on the built preview).

The error renderer put the recipe's class on its root and redrew every part under classes of its own — `aparte-error-icon-wrapper`, `-content`, `-title`, `-message`, `-details` are gone, and so are the tokens only they read (`--aparte-error-icon-size`, a 20px literal among derived values, and `--aparte-error-title`). The card body let a paragraph's margins stack on its padding, so the sheet's own example measured a body twice the height of its header. Under `overlay-composer` the composer floated over the transcript with a z-index and the transcript's own ground: a thing that floats has to be seen floating.
