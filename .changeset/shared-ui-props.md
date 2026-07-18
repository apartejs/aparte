---
"@aparte/core": minor
"@aparte/react": patch
"@aparte/vue": patch
"@aparte/svelte": patch
"@aparte/angular": patch
---

De-duplicate the wrappers' `AparteUi` prop-applier. The four wrappers each
carried a byte-identical vanilla-DOM prop applier + event list; they're now in
`@aparte/core` as `applyElementProps(el, props, transformValue?)` and
`DEFAULT_UI_EVENTS`. Vue passes `toRaw` as the transform to unwrap its reactive
proxy. No public wrapper API change.
