---
'@aparte/core': patch
'@aparte/plugin-approval': patch
'@aparte/plugin-artifacts': patch
'@aparte/plugin-ask-user': patch
'@aparte/plugin-model-selector': patch
---

Importing `@aparte/core` (or the approval, artifacts, ask-user or model-selector plugin) from a Web Worker, a Cloudflare Worker or an edge route now resolves the DOM-free entry instead of the browser one, which threw on its first `customElements.define`.

The DOM-free entry was reachable through the `node` condition only, and those runtimes' bundlers resolve `worker`, `workerd` or `edge-light` alongside `browser` and `import`. The exports maps now list `worker`, `workerd`, `edge-light`, `deno` and `bun` next to `node`, pointing at the same entry; a browser still gets the elements. `check:node-import` walks each published map with those runtimes' conditions.
