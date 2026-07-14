# @aparte/provider-transformers

Run LLMs **100% in the browser** via [Transformers.js](https://huggingface.co/docs/transformers.js)
(WebGPU, with a WASM fallback) — no API, no key, no server. Inference runs off the main thread in
a **Web Worker**, streaming tokens into aparté.

```bash
npm install @aparte/provider-transformers @huggingface/transformers
```

`@huggingface/transformers` is a **peer dependency** — you bring the version you want (it's heavy and
ships its own onnxruntime). `@aparte/core` is an **optional peer**.

```ts
import { AparteConfig, DirectTransport } from '@aparte/core';
import { TransformersProvider, registerModel } from '@aparte/provider-transformers';

registerModel({
  id: 'onnx-community/Qwen2.5-0.5B-Instruct',
  name: 'Qwen2.5 0.5B',
  task: 'text-generation',
  capabilities: ['streaming'],
  dtype: 'q4',
});
AparteConfig.registerAIProvider(TransformersProvider);
AparteConfig.setTransport(new DirectTransport({ byok: true }));
```

The provider owns its I/O (it runs inference locally), so `DirectTransport` just delegates to it.
Model weights download once and persist in the Cache API; `prepareModel` reports progress, and
`listCachedModels` / `deleteCachedModel` manage the on-disk cache.

> **Scope (v1):** generic text-generation streaming. Tool-calling for local models is
> model-specific and out of scope for now. Part of the
> [aparté](https://github.com/apartejs/aparte) monorepo. ESM-only.
> See the **Providers** guide in the docs for the full usage.
