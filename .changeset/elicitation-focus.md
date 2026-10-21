---
'@aparte/core': patch
---

A question or approval panel no longer steals the focus from a reader writing elsewhere, no longer lands on "Approve" while you type, and always announces itself.

- From a field outside the chat, an iframe or another chat, the focus stays where it is, and a polite status in the composer says the question.
- From the chat's own editor (typing the next message while a reply streams), the focus goes to the panel itself, named by the question, not to its first option: Enter no longer approves a tool call by accident.
- From a button (the chat's own or one of yours beside it) or from nowhere (a click in Safari, a screen reader's activation), the focus goes to the first control, without scrolling the page when it came from nowhere.
- The focus is followed through open shadow roots, so a field inside a web component counts as a field.
- On close it goes back to whoever had it, or to the composer when that is gone or was `<body>`.
- An approval's options are described by the question (`aria-describedby`).
