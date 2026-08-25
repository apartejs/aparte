---
'@aparte/core': patch
---

**`APARTE_DEFAULT_UI_EVENTS` now lists every event an aparté element dispatches on itself** — 23 names, up from 7.

This is the set `AparteUi` forwards in all four wrappers, so an event missing from it is an event a consumer cannot hear through the proxy. It described itself as "verified against core" while carrying seven of twenty-three, and the gap was not academic: `aparte-model-change` was absent, and `<aparte-ui name="aparte-model-selector">` was the one worked example in the wrappers' own documentation — the documented usage could not receive the event it exists to receive.

That example is gone from this release for a better reason than a longer list: `@aparte/plugin-model-selector` now types its own element and ships its own bindings, so its event is typed through the DOM and the proxy is not on the path at all. `aparte-model-change` is therefore *not* in this list — a plugin's event is the plugin's to declare, and core listing it was the same privilege the boundary change removed everywhere else.

Two of core's own events are also deliberately excluded: `aparte-abort` and `aparte-message-aborted` go out through `window.dispatchEvent`, so an element-level listener can never receive them and listing them would promise a forward that cannot happen. That is the whole difference between the manifest's 25 distinct event names and this list's 23.
