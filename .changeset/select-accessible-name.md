---
"@aparte/core": patch
---

`<aparte-select>`'s combobox trigger now carries an accessible name (axe
`aria-input-field-name`, serious): the host's `aria-label` when provided,
falling back to the `placeholder`. Screen readers previously announced the
model selector as an unnamed combobox.
