---
'@aparte/core': minor
---

While `<aparte-scroll-rail>` is a child of the chat, the chat leaves it a lane at its end edge (new `--aparte-scroll-rail-room`) and the rail sits in it, so no line runs under the ticks; set it to `0px` to let the rail float over the text as before.

The rail floated over the transcript's end edge without reserving room, so in a column that reaches that edge (a narrow chat, `--aparte-message-max-width: none`) the long lines ran under it. The lane is the rail's column plus its inset, as end padding on the chat, so the whole column moves together: messages, composer, the welcome, the loading skeleton and the scrollbar, which now sits before the rail. It is reserved from the start rather than when the rail has two ticks, so nothing moves mid-conversation. The padding weighs nothing, so a padding of your own on the chat still wins.
