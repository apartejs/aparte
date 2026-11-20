---
'@aparte/core': patch
---

A Stop pressed just as the reply ends no longer sends the message the person had drafted for later.

The reply could end between the press and the release: the same button turned back into Send, and the click sent the unfinished draft. A click now does what the button showed when it was pressed, so a Stop with nothing left to stop does nothing. The keyboard already refused it, since Enter neither sends nor stops during a turn.
