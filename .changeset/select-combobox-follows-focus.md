---
"@aparte/core": patch
---

A searchable `<aparte-select>` now puts `role="combobox"`, `aria-expanded`, `aria-controls` and the roving `aria-activedescendant` on the filter field instead of the trigger, so the arrow-key highlight is announced. The trigger becomes a `role="button"` when (and only when) the field exists; without `searchable` nothing changes.

Opening a searchable select focuses the filter field, and a screen reader follows focus — so the combobox state has to live there. It lived on the trigger: the highlight moved with every ArrowDown and was announced to nobody, and the control declared two comboboxes for one value. `aria-expanded` now follows the open state on both elements.
