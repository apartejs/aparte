---
"@aparte/core": patch
---

A disabled `<aparte-select>` no longer removes the `open` attribute you wrote, and opens the moment you remove `disabled`.

`open` is the consumer's attribute, and a one-way binding writes it once: taking it back left the template saying open and the element saying closed, with no write left to reconcile them — `<aparte-select [disabled]="true" [open]="true">` in Angular went to the element and came straight back out. The select still refuses to open while disabled; the attribute simply stands, and the `disabled` branch honours it on the way out, symmetrically to the close it already does on the way in.
