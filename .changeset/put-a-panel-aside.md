---
'@aparte/core': minor
'@aparte/locale-fr': minor
---

An open question or approval panel can now be put aside, to read the transcript behind it: a chevron in its corner leaves a one-line "Waiting for your answer" bar that brings it back. The request stays open meanwhile, and the composer's button cannot send it until it is brought back: what is out of sight is not reviewed.

The panel takes the composer over and caps at half the viewport, so the reply it asks about could sit right behind it with no way to read it. Both kinds get the button, first in the corner, before a question's Skip. Two locale keys are new: `elicitationHide` ("Hide for now") and `elicitationWaiting` ("Waiting for your answer"), translated in `@aparte/locale-fr`. `--aparte-elic-dismiss-room` defaults to 104px (was 72px) to make room for the button; widen it as before for a locale whose "Skip" is wider.
