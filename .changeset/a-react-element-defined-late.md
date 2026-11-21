---
'@aparte/react': patch
---

A plugin component mounted before its element is defined (the spec imported at once, the element's module loaded later) now hands its properties to the element once it is defined.

The generated component assigned each property straight onto the element. Before the upgrade, that made it the element's own property, which hid the setter the definition brought, for good: the element rendered empty. It is held until the tag is defined, as core already does for `<AparteUi>`.
