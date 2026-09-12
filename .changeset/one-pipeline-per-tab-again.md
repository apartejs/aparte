---
"@aparte/provider-transformers": patch
---

Preparing a second model no longer disposes the pipeline a reply is streaming from, two `prepareModel` calls in the same tick no longer leave two models resident, and the cache budget will not evict weights a generation is reading. Nothing to change on your side — a `prepare` issued during a stream now waits for it instead of interrupting it.

`prepare`, `generate` and `command` all go through `ensureRunner`, which disposes the previous runner when the model or runner key changes, and the worker ran them concurrently. Picking another model while a reply streamed — the documented `TransformersProvider.prepareModel`, which was on no chain at all where `runnerCommand` is explicitly queued — therefore called `dispose()` on the ONNX session the running `pipe(...)` was executing. And two prepares issued before the first resolved both observed no resident runner across the three awaits, so the second orphaned the first: two multi-GB models in one tab, the older one unreachable for cleanup, which is the exact failure the "one pipeline per tab" rule exists to prevent. All three now share one promise chain in the worker, the way the main thread already chains its generates; `cancel` stays immediate, since its whole job is to reach the generate running now.

The cache budget fires on `pipeline-ready`, i.e. when ANOTHER model finishes loading, and kept only that model — so it deleted the files of the model that was answering, and `deleteCachedModel` terminates the worker when that model is the loaded one. A model with a generate queued or running counts as in use.
