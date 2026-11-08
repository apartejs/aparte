---
'@aparte/plugin-compaction': minor
'@aparte/plugin-model-selector': minor
'@aparte/plugin-approval': minor
---

These plugins now add `/compact`, `/model` and `/approval` to `@aparte/plugin-triggers`' menu when it is on the page.

They answer an event, so neither side depends on the other, and nothing changes without the menu. Turn one off with `setupCompaction({ commands: false })`, `setupApproval({ commands: false })` or `<aparte-model-selector commands="false">`.
