---
'@aparte/core': patch
'@aparte/plugin-approval': patch
'@aparte/plugin-artifacts': patch
'@aparte/plugin-ask-user': patch
'@aparte/plugin-model-selector': patch
---

Importing `@aparte/core` (or the approval, artifacts, ask-user or model-selector plugin) from a Cloudflare Worker, a Vercel edge route or a Web Worker that webpack compiles with `target: 'webworker'` now resolves the DOM-free entry instead of the browser one, which failed at import on its first `extends HTMLElement`.

The DOM-free entry was reachable through the `node` condition only, and those bundlers resolve `workerd`, `edge-light` or `worker` alongside `browser` and `import`. The exports maps now list `worker`, `workerd`, `edge-light`, `deno` and `bun` next to `node`, pointing at the same entry; a browser still gets the elements. A worker started inside a page build is not covered — `new Worker(new URL('./w.js', import.meta.url))` under Vite, or under webpack with its default `target: 'web'`: both resolve it with the browser's conditions, so it gets the browser entry. For core, import the new `@aparte/core/headless` there; the plugins have no such subpath, and how to run a provider or a plugin's tool in that worker is on the [Elements page](https://apartejs.dev/frameworks/elements/#on-the-server). `check:node-import` walks each published map with the conditions of webpack's worker target, wrangler and a Vercel edge route.
