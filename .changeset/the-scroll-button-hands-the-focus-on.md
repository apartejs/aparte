---
'@aparte/core': patch
---

Pressing the scroll-to-bottom button from the keyboard now moves the focus to the transcript as the button hides, instead of leaving it on a hidden control.

At the bottom the button turns transparent, leaves the tab order and is marked `aria-hidden`, but it kept the focus. A screen reader was left on a node removed from the tree, a keyboard user had no focus ring, and Space kept pressing a control nobody could see.
