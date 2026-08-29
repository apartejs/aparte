---
"@aparte/core": patch
---

`aparte-sidebar-toggle` announces a change, never the starting state: `<aparte-sidebar collapsed>` is silent at mount, and so is a sidebar that enters as a closed drawer on a narrow window. Read `collapsed` after connect for the state it started in.

The element used to read its markup as a change. During an UPGRADE — the ordinary case for server-rendered markup, where the module loads after the HTML — `attributeChangedCallback` fires for every authored attribute while the element is already connected and before `connectedCallback` has run. `collapsed` was therefore announced as a toggle the host never asked for, carrying `drawer: false` because the media query had not run yet: a host persisting that detail wrote "the column is open" over a drawer that was closed.

`connectedCallback` stamps what the markup asked for AFTER the breakpoint has been applied, and the attribute callback is gated on that, the way `<aparte-split>` already was.
