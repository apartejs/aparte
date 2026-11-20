---
'@aparte/core': patch
---

Under React, Vue, Svelte and Angular, a scrolled conversation no longer moves up and down by a pixel while a reply streams reasoning.

Nothing to change in your code. The space kept under a reply (so the question stays at the top) was written as a fraction and, under a wrapper, read back as that fraction against a `scrollHeight` the browser gives in whole pixels. It never settled: on every streamed delta that grew nothing on screen, a closed reasoning block in the reply or in a sub-agent's transcript, it went 65.6, 66.1, 65.6 px, and the thread, held at the end of its scroll, moved a pixel each way for as long as the reply streamed (apartejs/aparte#270). The space is now whole pixels, so measuring it again with nothing changed gives the same value, in both modes; raw core also loses a one-pixel jump on the second measure.

A browser test now reads every frame of a reasoning reply streaming into an already scrolled thread, on every example, at half a pixel.
