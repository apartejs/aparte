---
'@aparte/core': minor
---

A send can be held: call `preventDefault()` on the new `aparte-before-send` event (`onBeforeSend` / `@before-send` / `onbeforeSend` in the wrappers) and the message stays in the composer, text and files, with nothing added to the thread; `getComposer()?.submit()` sends it later (#245).

The event goes out before `aparte-send`, with the same detail. `aparte-send` itself could not be the cancelable one: the conversation controller appends the person's message in the capture phase on the chat, so it runs before any listener an app can add, and a cancel there arrived after the message was already in the thread. A first event of its own has no such race, the shape the platform uses for `beforeinput` before `input`. The `getComposer()` documentation now names `setValue()`, `submit()` and `addAttachments()`.
