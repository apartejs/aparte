---
'@aparte/core': patch
---

A modal dialog placed inside `<aparte-sidebar>` keeps its Escape and Tab while the sidebar is a drawer: the drawer no longer closes behind it.

A settings dialog put beside its button in the sidebar was taken for the drawer's own content. Its Escape closed the drawer, which then made itself inert with the open modal inside it, so the page could not be used until a second Escape; Tab from the dialog's last button went nowhere. A modal dialog anywhere on the key's path now has the key, as one outside the sidebar already did.
