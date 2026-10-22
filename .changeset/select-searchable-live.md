---
'@aparte/core': patch
---

`<aparte-select searchable>` set or removed after the select is drawn now adds or removes the filter field, and moves the combobox role with it.

It was read on the first render only, so a framework that binds it a beat late — Angular's `[searchable]` inside an `@if` — got a select with no filter.
