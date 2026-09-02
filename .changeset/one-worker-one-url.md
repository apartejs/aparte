---
"@aparte/provider-transformers": patch
---

The worker now ships as `dist/worker.js` and is constructed from a literal `new URL('./worker.js', import.meta.url)`, so a bundled app resolves `@huggingface/transformers` inside the worker instead of failing on every model load. No configuration changes on your side — no worker loader, no copy rule, no entry of your own.

`_spawnWorker` carries a comment saying that literal "is not style": it is the exact shape Vite's worker detection and webpack's WorkerPlugin match on, and matching it is what makes a consumer's bundler process the worker as a MODULE rather than copy it as an opaque asset. The claim was true of the source and false of the published bytes. The build handed the emit to Vite's own worker plugin, which rewrote the call to `new Worker(new URL(/* @vite-ignore */ "" + new URL("assets/worker-<hash>.js", import.meta.url).href, import.meta.url))` — nothing static left for anyone to detect. The chunk was then copied verbatim, its `import('@huggingface/transformers')` stayed a bare specifier no browser can resolve, and it also pulled two sibling hashed runner chunks a consumer's build never emitted.

Two things had to become true: the worker must sit at a stable path a bundler can be pointed at, and it must contain no specifier a verbatim copy cannot resolve. It is a second lib entry now, so `dist/worker.js` and `dist/runners/{shared,text-generation,image-text-to-text}.js` are real published files with names — relative between themselves, so they follow the worker to whatever origin serves it, and `@huggingface/transformers` is the one bare specifier left. The build removes Vite's `worker-import-meta-url` and `asset-import-meta-url` transforms, which is what lets the literal survive into the artifact; dev and the test run keep them, since that is what resolves `./worker.js` to `src/worker.ts` there.

Both halves are now asserted against the built bytes rather than the source — `src/__tests__/published-shape.test.ts` for the literal and the file, and a `check:bundle-entries` contract that walks the worker's chunks for stray specifiers. The defect existed only in the output, so only a test that reads the output could have seen it.

The cross-origin `blob:` path is unchanged: same behaviour, same CSP note, same error message.
