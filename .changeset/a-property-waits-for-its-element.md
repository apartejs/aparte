---
'@aparte/core': patch
---

A property given to an element before its definition loads (a lazily imported plugin's `diff`, `comments`, `chat`, `triggers`) now reaches the element once it is defined.

`<AparteUi>` and the wrappers' generated elements assigned it right away, so it became the element's own property and hid the setter the definition brought, for good, although the docs promise a tag mounted before its definition upgrades on its own. The value is now kept and handed to the setter when the element is defined.
