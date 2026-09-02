---
"@aparte/core": patch
---

A searchable `<aparte-select>` again announces which option is selected: its trigger's accessible name is now `"<control>: <selected label>"` (e.g. "Pick a model: GPT-4o mini") instead of the control's name alone.

`searchable` makes the trigger a `role="button"`, and a button takes its name from its content — which an author `aria-label` overrides. The name written for the combobox shape (where the visible label span was the VALUE and the attribute only the NAME) therefore swallowed the selection: readers heard "Pick a model, button" and never the model. The name now carries both halves, follows every selection change, and drops the second half when it would only repeat the first. The listbox keeps the control's name, and a non-searchable select is unchanged.
