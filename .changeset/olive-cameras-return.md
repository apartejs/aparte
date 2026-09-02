---
"@aparte/core": patch
---

Leaving a bubble's inline editor now lands on a button the reader can actually use, and moves the action bar's tab stop with it.

The restore added in the previous patch focused the button that opened the editor, but stopped there, and two cases in its own subject — the reader must not lose their place — still lost it.

The bar is a `role="toolbar"`: one tab stop that the arrows move. Rebuilding it parks that stop on the first button (copy), so focusing edit put the reader on a `tabindex="-1"` member — Shift+Tab out and Tab back returned them to copy, not to the button they were on. The restore now sets the stop before focusing, the same two lines the arrow-key handler already uses.

And the remembered action can come back **disabled** — the reader sent from the composer mid-edit, so the transcript is busy and edit is rebuilt disabled — or gone, if the action was turned off while the editor was open. `focus()` on a disabled button is a no-op, so the focus fell to `<body>`: the exact bug, silently. The restore now falls back to the bar's first enabled button.
