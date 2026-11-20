---
'@aparte/core': minor
'@aparte/locales': minor
---

New `showToast(text, { tone, timeout })` in the kit: a short message in a corner of the page that goes away on its own.

For what has nowhere else to be said, such as why an action did not happen. It is the kit's alert, stacked in a fixed corner that never moves the layout under the pointer. It is announced as a status, or as an alert in the `danger` tone, waits while it is hovered or holds the focus, and closes by its button or Escape. It returns a handle with `close()`, and does nothing in a server render. Two locale keys name its region and its button (`notifications`, `dismissNotification`), in the nine languages. (apartejs/aparte#279)
