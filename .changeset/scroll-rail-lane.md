---
'@aparte/core': minor
---

While `<aparte-scroll-rail>` is a child of the chat, the messages and the composer leave it a lane at their end edge (new `--aparte-scroll-rail-room`), so no line runs under the ticks; set it to `0px` to let the rail float over the text as before.

The rail floated over the transcript's end edge without reserving room, so in a column that reaches that edge (a narrow chat, `--aparte-message-max-width: none`) the long lines ran under it. The lane is the rail's column plus its inset, reserved from the start rather than when the rail has two ticks, so the column does not move mid-conversation; the reading column centres in what remains, the composer with it. The rules weigh nothing, so a padding of your own on the bubble or the composer still wins.
