---
"@aparte/core": minor
"@aparte/locale-fr": minor
---

New element `<aparte-scroll-rail>`: a rail of ticks beside the transcript, one per user turn (`every="message"` for one per message), that marks which message is under the reader and jumps back to any of them on a click. Place it as a direct child of `<aparte-chat>` (or the wrapper's host); it floats on the transcript's end edge, hides under a coarse pointer, and renders nothing below two ticks. A click fires a cancelable `aparte-scroll-rail-jump` (`{ messageId }`) before the `scrollIntoView`, so a host that pages history in can load it first. Four knobs: `--aparte-scroll-rail-width`, `-tick-size`, `-tick-thickness`, `-gap`; one locale key, `scrollRailLabel`.

It reads the transcript and never owns it: which bubbles exist (a mutation observer on the chat), which one is under the reader (an intersection observer on the scroll surface), and the first words of each for the tick's name. No product ships this natively — it exists as browser extensions and as open requests — which is why it is here.
