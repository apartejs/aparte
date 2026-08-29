---
"@aparte/core": patch
---

A field group's prefix and suffix (`.aparte-field-group__prefix` / `__suffix`) sit on their own ground — `--aparte-surface-2` with a rule against the field — instead of the field's. Muted text on the same ground, "https://" read as the start of what the user had typed. The group clips to its corners for it (`overflow: hidden`); the focus ring is a shadow on the group, outside that box, and is not clipped.
