---
'@aparte/core': minor
---

New `@aparte/core/headless` subpath: the entry without elements (client, chat host, transports, conversations, config, parsers, types), by name. Import it in a Web Worker started inside a page build — `new Worker(new URL('./w.js', import.meta.url))` under Vite, or under webpack with its default `target: 'web'`.

Those workers are resolved with the page's conditions (`browser`, `import`), so `@aparte/core` hands them the entry with the elements, which fails at its first `extends HTMLElement`; no export condition can reach them. The subpath is the counterpart of `@aparte/core/browser`, which names the entry with the elements.

The subpath covers what the worker imports from core itself: a provider or plugin in that worker imports `@aparte/core` by its bare name, which still resolves to the browser entry. For those, resolve the bare name to the subpath in the worker's build only — the [Elements page](https://apartejs.dev/frameworks/elements/#on-the-server) has the Vite recipe. A plugin whose entry defines an element (approval, model selector) cannot run in a worker either way.
