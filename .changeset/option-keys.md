---
'@aparte/core': minor
---

A question or approval whose options are buttons now answers to the keyboard: 1 to 9 press the matching option, and Escape means Skip (question) or the one refusing option (approval).

Each option wears its number and carries `aria-keyshortcuts`. The digits work only while an option has the focus, so a number typed in a sentence stays text; a held key, a modifier, an IME composition and a text field (the "Other" field, the instruction) are ignored. Escape on an approval presses the option with `tone: 'deny'` only when there is exactly one, and it no longer closes a launcher the chat sits in while a panel is asking. On by default.
