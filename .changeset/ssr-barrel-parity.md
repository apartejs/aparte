---
"@aparte/core": patch
---

Fix a server-side-rendering crash on the framework wrappers. The Node/SSR entry
(resolved via the `node` export condition) was missing `applyElementProps` and
`DEFAULT_UI_EVENTS` — two DOM-free interop helpers that every wrapper's `AparteUi`
imports as **values**. Because each wrapper barrel re-exports `AparteUi`, importing
anything (even just `AparteChat`) from `@aparte/react` / `@aparte/vue` /
`@aparte/svelte` / `@aparte/angular` under SSR (Next.js, Nuxt, SvelteKit, Angular
Universal) crashed the whole barrel with `does not provide an export named
'applyElementProps'`.

The Node/SSR entry now mirrors the browser barrel's full non-DOM surface — also
exposing `DirectTransport`, `BackendTransport`, `isFormatAdapter`,
`parseAparteEventStream`, and the render-hook / transport / tool-resolver types that
were only on the browser entry — and a new parity test enumerates that surface so the
two barrels can never silently drift again.
