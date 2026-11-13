---
'@aparte/core': patch
---

On a touch screen the chat no longer keeps 28 px at its end edge for the scroll rail, which is hidden there: the column is centred again on a phone.

The rail hides under `(pointer: coarse)`, since a 2 px tick is no target for a finger, and its lane stayed reserved. It now goes with it. On a screen with a mouse nothing changes: the lane is kept from the first message, so the column does not move when the rail appears.
