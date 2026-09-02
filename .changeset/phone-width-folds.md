---
"@aparte/core": patch
---

At a phone's width the kit folds: the app shell recipe becomes one column under 48rem (the sidebar element already left the grid as a drawer, the grid kept its column anyway), the split's minimum is `min(20rem, 100%)` so a pane can never ask for more than the viewport has, and a modal dialog on a phone is a bottom sheet as tall as its content, capped at the screen and clear of the safe areas — it used to stretch a label, a field and two buttons over a 100dvh sheet glued to the physical edges.

Measured on the 375px captures: the shell gave 259 of its 303px to the sidebar and left the chat a 43px band with the send button cut in half; a 20rem floor on a 375px screen annihilated the end pane to 0px; 586px of empty sheet under a three-control form.
