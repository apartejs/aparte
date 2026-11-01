---
"@aparte/plugin-artifacts": patch
---

An artifact's preview stays open when its card is drawn again; it used to close and show the code.

A framework redraws a message's segments when its conversation is saved: in the React example,
the next message replaced the artifact card and the new one opened on Code, the preview the
person had just asked for gone. The card now remembers the tab chosen, per chat, for that very
document (its id and its content), and opens on it again. Only what a gesture already ran: a
reload, another document under the same id, a card still streaming or another chat open on
Code, as before.
