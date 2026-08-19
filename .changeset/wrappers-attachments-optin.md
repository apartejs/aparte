---
"@aparte/react": minor
"@aparte/vue": minor
"@aparte/svelte": minor
"@aparte/angular": minor
---

**Behavior change:** the default composer shell no longer mounts the file picker. All four
wrappers gained an `attachments` prop (`false` by default) that adds
`<aparte-composer-add-attachment>` + `<aparte-composer-attachments>` back.

**Migration:** if your chat offers file attachments, add the prop —
`<AparteChat attachments />` (React/Svelte), `<AparteChat attachments />` /
`:attachments="true"` (Vue), `<aparte-chat attachments>` (Angular). Passing your own
`composer` is unaffected: you place the primitives yourself, as before.

Why: the picker was hard-coded in the four wrapper templates while core's own
`<aparte-chat>` default shell never had it — so "the default composer" meant two different
things depending on where you looked, and the docs described the wrong one. And the
capability is only real if the host consumes the files: an `AparteClient` inlines them per
its `rawFileInject` option, but an app driving its own loop must read `event.files` or the
file the user deliberately attached is dropped in silence, with the UI still showing it was
sent. Opting in is now that acknowledgement.
