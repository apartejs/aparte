---
"@aparte/angular": minor
---

Bind `[conversations]` on `<aparte-conversation-list>` with no `CUSTOM_ELEMENTS_SCHEMA`: its directive now has that input.

The element directives were generated from the elements' attributes only, so a member that exists only as a JS property — the list's rows — had no input, and `[conversations]="…"` did not compile unless the component switched template checking off for every unknown tag. The generator now also emits an input for each public property an element has no attribute for; it hands the value over as the property. `<aparte-conversation-list>`'s `conversations` is the only such member today.
