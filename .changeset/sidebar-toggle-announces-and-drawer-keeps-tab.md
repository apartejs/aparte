---
"@aparte/core": patch
---

A `[data-aparte-sidebar-toggle]` control now carries `aria-expanded` and `aria-controls`, kept in step by the sidebar whoever changes the state, and the open drawer keeps Tab inside it.

The toggle opened and closed the sidebar without announcing its state, while the conversation row's own `⋯` button already did; the sidebar gives itself an id when the host wrote none, so the control can point at it. Tab from the drawer's last control used to walk out under the scrim onto the transcript it was covering; it wraps to the first control now, and Shift+Tab the other way. No `focusin` guard was added on purpose: it would steal the focus back from a dialog the drawer's own content opens onto `<body>`.
