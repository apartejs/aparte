---
"@aparte/core": patch
---

A file outside the `accept` list of `<aparte-composer-add-attachment>` is no longer attached when it is dropped, pasted, or picked through the dialog's "All files". It is left out without a message.

`accept` only reached the file input, where the browser reads it as a suggestion: its dialog offers "All files", and a drop or a paste never sees the list at all. Measured against a real n8n: with `accept="image/*"`, a PDF dropped on the composer was attached and sent. The list is now checked where the file arrives, read the way the browser reads it — `.ext` against the name, `type/*` against the MIME family, anything else against the exact type.
