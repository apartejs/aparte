---
'@aparte/core': patch
'@aparte/react': patch
'@aparte/vue': patch
'@aparte/svelte': patch
'@aparte/angular': patch
---

A key that leaves `<AparteUi>`'s `props` is now cleared on the element: its attribute or CSS variable is removed, and its property is set to `undefined`.

With the usual `{ ...(fetching && { loading: true }) }`, the next bag has no `loading` once fetching ends, and only the keys present were written, so the attribute stayed and the skeleton rows never went away, in all four wrappers. `applyElementProps` takes `{ replace: true }` for a bag that is the element's whole set of props; without it, as the generated components call it with only what changed, an absent key is left alone.
