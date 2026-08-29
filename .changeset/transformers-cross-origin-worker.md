---
"@aparte/provider-transformers": patch
---

`@aparte/provider-transformers` runs when it is served from another origin than the page — a CDN, or any deploy whose assets have their own host.

Two walls stood between this provider and such a page, and each one hid the next.

**The worker could not be constructed.** `new Worker()` refuses a cross-origin script outright, so the provider threw `SecurityError: Script at '…/assets/worker-*.js' cannot be accessed from origin '…'` at the first `prepareModel()`. It is not a CDN-only case: any app whose JavaScript is served from an asset host hits it, bundler or not. The worker is now started through a same-origin `blob:` whose whole body is one absolute import of the real file — a blob inherits the origin of the document that mints it, which is what makes it legal, and it is the same shim ffmpeg.wasm and tesseract.js use. Same-origin keeps the direct construction: no blob, nothing to revoke, and a stack trace that names the real file. The blob is released when the worker is terminated.

**The worker could not resolve Transformers.js.** Its first line imported `@huggingface/transformers` by bare specifier, and an import map is the *document's*: by spec it does not reach a worker, so a page could map the specifier for itself and the worker still could not use it. The worker now resolves the module when it first needs it — `import('@huggingface/transformers')` first, which is statically visible so a bundler resolves and bundles the peer exactly as before, and failing that the absolute URL the main thread read out of the page's own import map (through `import.meta.resolve`, falling back to reading the map) and sent in the worker's first message.

Nothing new is exported, and nothing changes for an app with a bundler. For a page without one, the import map it already needs to import `@aparte/core` by name is now also what tells the worker where Transformers.js lives — the version pin stays with you, which is what the peer dependency was for.

One case remains impossible: a page whose Content-Security-Policy forbids `blob:` in `worker-src`/`script-src` cannot start a cross-origin worker at all, and the provider now says so by name instead of letting the browser's own message stand. Serve the package from your own origin there.
