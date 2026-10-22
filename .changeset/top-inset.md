---
'@aparte/core': minor
---

New `--aparte-top-inset`, the counterpart of `--aparte-bottom-inset`: set it on the chat to the height of a header floating over the transcript, and the first message starts below it while a jump to a message (the scroll rail, `scrollIntoView`) lands below it.

The scroll surface reads it as top padding and scroll padding; under a framework wrapper, where the viewport itself scrolls, as a spacer before the first message. The scroll rail's landing check now measures from below the scroll padding, so it no longer reads the inset as a miss and scrolls again. The Layout guide shows the recipe; a header goes outside the chat, since a child of an `overlay-composer` chat floats at the bottom with the composer.
