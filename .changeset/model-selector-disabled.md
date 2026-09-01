---
"@aparte/plugin-model-selector": patch
---

`<aparte-model-selector disabled>` disables the picker, and inside an `<aparte-composer>` the picker follows the composer's own `disabled` — it used to stay fully operable while the field and the send button around it were inert.
