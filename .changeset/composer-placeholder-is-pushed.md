---
"@aparte/core": patch
---

Changing `placeholder` on `<aparte-composer>` now updates an `<aparte-composer-input>` already on the page. `syncPlaceholder()` on the input is the method the composer calls; an input with a `placeholder` of its own is unaffected.

The input read the composer's placeholder as a fallback when it rendered and never again, and the composer's attribute callback for it was an empty branch — so a placeholder bound to a translated string went stale on the first language switch after mount.
