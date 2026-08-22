# @aparte/provider-transformers

Run LLMs **100% in the browser** via [Transformers.js](https://huggingface.co/docs/transformers.js)
(WebGPU, with a WASM fallback) — no API, no key, no server. Inference runs off the main thread in
a **Web Worker**, streaming tokens into aparté.

```bash
npm install @aparte/provider-transformers @huggingface/transformers
```

`@huggingface/transformers` is a **peer dependency** — you bring the version you want (it's heavy and
ships its own onnxruntime). `@aparte/core` is a **peer dependency**.

```ts
import { aparteGlobalConfig, AparteDirectTransport } from '@aparte/core';
import { TransformersProvider, registerModel } from '@aparte/provider-transformers';

registerModel({
  id: 'onnx-community/Qwen2.5-0.5B-Instruct',
  name: 'Qwen2.5 0.5B',
  task: 'text-generation',
  capabilities: ['streaming'],
  dtype: 'q4',
});
aparteGlobalConfig.registerAIProvider(TransformersProvider);
aparteGlobalConfig.setTransport(new AparteDirectTransport({ byok: true }));
```

The provider owns its I/O (it runs inference locally), so `AparteDirectTransport` just delegates to it.
Model weights download once and persist in the Cache API; `prepareModel` reports progress, and
`listCachedModels` / `deleteCachedModel` manage the on-disk cache.

## One pipeline per tab

Unlike every other aparté provider, this one's state is **tab-scoped, not chat-scoped**: one
worker, one loaded model, one generate at a time. `setComputeDevice`, `setMaxCachedModels` and
`setHardwareTierModels` set it for the whole page.

That is the resource talking, not a design preference — a local model is 1–2 GB of weights and
one WebGPU pipeline, so a worker per chat would mean N copies resident in one tab. Two chats on
the **same** model is the case this is for: they share the load, for free.

Two chats on **different** models is the case that costs. They serialize on the one pipeline,
and at the default budget of one cached model each turn can evict and reload gigabytes. The
provider warns once when it sees it:

```ts
import { setMaxCachedModels, getMaxCachedModels } from '@aparte/provider-transformers';

setMaxCachedModels(2);            // keep both resident, if the machine has the memory
setMaxCachedModels(0);            // no limit — you are managing memory yourself
getMaxCachedModels();             // the current budget
```

> **Scope (v1):** generic text-generation streaming, **browser-only** (unlike the other
> providers — it needs WebGPU/WASM, Workers and the Cache API, so it is the one adapter that
> does not run in Node). Tool-calling for local models is model-specific and out of scope for
> now: `tool_call` / `tool_result` turns are dropped from the prompt, with a one-time console
> warning. Part of the
> [aparté](https://github.com/apartejs/aparte) monorepo. ESM-only.
> See the **Providers** guide in the docs for the full usage.
