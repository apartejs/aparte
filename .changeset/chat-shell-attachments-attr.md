---
"@aparte/core": minor
---

`<aparte-chat>` gained an **`attachments`** attribute: it adds the file picker
(`<aparte-composer-add-attachment>`) and the chips strip (`<aparte-composer-attachments>`)
to the default composition, in their canonical positions. It is reactive — toggling it
after mount inserts or removes the two primitives, and removing it also drops any file
already staged in the composer (keeping them would send files with nothing in the UI
showing them).

Nothing changes without the attribute: the default composition is still
`viewport + composer(input · send)`. Attachments are **opt-in** because the capability
needs a host that consumes the files — an `AparteClient` inlines them per its
`rawFileInject` option, but a hand-rolled loop has to read `event.detail.files` or the
user's file is dropped in silence. Composing your own composer? Keep dropping the two
primitives in wherever you want them, as before.
