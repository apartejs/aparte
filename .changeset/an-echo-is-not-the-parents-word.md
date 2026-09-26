---
"@aparte/react": patch
"@aparte/vue": patch
"@aparte/svelte": patch
---

Fixed: in controlled mode (`messages` with `onMessagesChange`), a finished reply could roll back to an earlier state — its text cut mid-word, its tool rows gone. It happened when the parent re-rendered late, which React does in Safari.

The chat emits its list as it streams, the parent stores it, and the prop comes back. When the parent's render lands after the chat's next write, the prop that arrives is an EARLIER emit, and the wrapper took it for the parent's word: it rolled the list back, the chat built its next writes on the stale copy, and the reply stayed broken. Measured in the examples' browser suite at about one run in five on React + WebKit, on `main` as on the branch. The wrappers now recognise their own emits when they come back — current or stale — and ignore them; a list the parent builds itself is still applied. Angular is unaffected: its list is one `model()` signal both sides write in step.
