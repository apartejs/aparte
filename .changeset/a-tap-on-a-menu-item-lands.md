---
'@aparte/core': patch
---

A tap on a kit menu item (a row's Rename, Pin, Delete) now keeps the menu open until the tap's click lands.

The menu closes when the focus leaves for nowhere unless a press inside it is under way, and that press ended at `pointerup`. On a touch screen the tap's click comes after the finger is lifted, and on iOS so does the compatibility `mousedown`, which blurs the focused item: the menu could close before the click reached the item. A touch press now lasts until its click, or 600 ms if none comes. iOS's event order was not measured here; the change leaves mouse presses as they were.
