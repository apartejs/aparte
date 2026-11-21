---
'@aparte/core': minor
'@aparte/engine': minor
'@aparte/plugin-subagents': minor
---

A step can say what it is about: `step-start` carries a `detail`, a new `step-update { name, detail }` changes it while the step stays open, and the step's label function is handed `detail` and the reply's `messageId`.

A server waiting for a slot of a local engine knows who holds it, and the words belong to the page. A step carried its name alone and its label saw only that: an app kept the last holder in a module of its own, ended and restarted the step to have the words asked again, and two chats waiting showed the last one told. The detail travels with the step to the reply's waiting indicator and to a sub-agent's line, and the label is asked again when it changes. A second `step-start` of the same name still opens a nested step, as AG-UI's rule says: update a step with `step-update`. (apartejs/aparte#288)
