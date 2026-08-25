---
'@aparte/core': patch
---

**`APARTE_DEFAULT_UI_EVENTS` now lists every event an aparté element dispatches on itself** — 25 names, up from 7.

This is the set `AparteUi` forwards in all four wrappers, so an event missing from it is an event a consumer cannot hear through the proxy. It described itself as "verified against core" while carrying seven of twenty-five, and the gap was not academic: `aparte-model-change` was absent, and `<aparte-ui name="aparte-model-selector">` is the one worked example in the wrappers' own documentation. The documented usage could not receive the event it exists to receive.

Two events are deliberately excluded: `aparte-abort` and `aparte-message-aborted` go out through `window.dispatchEvent`, so an element-level listener can never receive them and listing them would promise a forward that cannot happen.
