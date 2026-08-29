---
"@aparte/core": patch
---

`<aparte-sidebar collapsed>` no longer fires `aparte-sidebar-toggle` at upgrade, and no longer reports `drawer: false` over a drawer.

A sidebar that mounts on a narrow window and enters as a closed drawer no longer announces that either — the mount is the starting state, not a change. Read `collapsed` after connect instead of listening for it.

The element read its markup as a change. During an UPGRADE — the ordinary case for server-rendered markup, where the module loads after the HTML — `attributeChangedCallback` fires for every authored attribute while the element is already connected and before `connectedCallback` has run. `collapsed` was therefore announced as a toggle the host never asked for, carrying `drawer: false` because the media query had not run yet: a host persisting that detail wrote "the column is open" over a drawer that was closed.

`connectedCallback` now stamps what the markup asked for AFTER the breakpoint has been applied, and the attribute callback is gated on that, the way `<aparte-split>` already was.
