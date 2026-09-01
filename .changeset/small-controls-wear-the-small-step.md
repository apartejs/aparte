---
"@aparte/core": patch
---

The bubble's action bar, its branch arrows and the conversation row's `⋯` are all the button recipe's small step (24px); the select trigger declares its own font size and reads the theme's `--aparte-radius-select`.

Three controls redrew their own box over the recipe: the arrows set width and height to a 20px token while the element also carried `--sm` (24), the `⋯` did the same at 20, and the action bar fed 28 with a 24 exception for the last user turn — three control heights in one row. They feed the recipe's token or wear its modifier now, and under `(pointer: coarse)` the `⋯` takes the touch-target size like the other four. `--aparte-branch-picker-btn-size` and `--aparte-branch-picker-btn-icon-size` are gone; `--aparte-action-bar-btn-size` and `--aparte-conv-action-btn-size` default to `var(--aparte-btn-size-sm)`. The select's trigger declared no `font-size` at all and took the host page's, so every integrator saw a different select; it reads the control step. Its radius existed twice under two names with two values — the private `--aparte-select-radius` is gone, the theme's `--aparte-radius-select` stays.
