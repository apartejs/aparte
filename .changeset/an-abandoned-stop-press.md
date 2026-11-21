---
'@aparte/core': patch
---

Enter or Space on the Send button sends again after a press on Stop that never became a click (the pointer slid off before the release, or a touch turned into a scroll).

The button remembers what it showed when it was pressed, so a Stop released just after the reply ended does not send the draft. That record outlived a press that produced no click, and the next activation from the keyboard was read as that Stop: the draft was not sent until a second press. The record now only counts for a click a press produced.
