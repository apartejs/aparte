---
"@aparte/core": patch
---

Every button core renders is `type="button"`, so a chat placed inside a host `<form>` no longer submits it when a reader copies a code block, presses a branch arrow or clicks an action; the code block's copy button carries an `aria-label`; the reasoning panel is a focusable, named region.

Thirteen emitted buttons had no type (the bubble's action bar, branch arrows and edit controls, the composer's send and stop buttons, the code block's copy button) and one custom action button was created without one — and a button with no type is a submit button. The copy button was also the one icon button in core named by `title` alone, which a screen reader does not read; its accessible name now follows the "copied" confirmation too. The reasoning panel is a scroll container (`max-height` + `overflow-y: auto`) and had no tab stop, so a keyboard reader on Safari could not scroll it; it is `role="region"` with `tabindex="0"`, named after its label. A source test now refuses a new untyped button.
