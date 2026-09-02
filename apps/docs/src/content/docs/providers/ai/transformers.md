---
title: 'Run an LLM 100% in the Browser (Transformers.js)'
description: Run LLMs 100% in the browser via Transformers.js (WebGPU/WASM) — no API, no key, no server. Streams off the main thread in a Web Worker.
sidebar:
  order: 4
  label: transformers
---

Run models **100% in the browser** via [Transformers.js](https://huggingface.co/docs/transformers.js)
(WebGPU, with a WASM fallback) — no API, no key, no server. Inference runs off the main thread in a
Web Worker; weights download once and persist in the Cache API.

```bash
npm install @aparte/provider-transformers @aparte/core @huggingface/transformers
```

`@huggingface/transformers` is a **peer dependency** — it's heavy and ships its own onnxruntime, so
you bring the version you want.

:::note[From a CDN, the import map is what tells the worker where to look]
Inference runs in a worker, and a worker is where the no-build path gets interesting. Two
rules of the platform decide it: `new Worker()` refuses a cross-origin script, and an
import map belongs to the *document* — it does not reach a worker. So from a CDN the
provider starts its worker through a same-origin `blob:` that imports the real file by
absolute URL, and the worker asks the main thread where Transformers.js lives; the answer
comes from your page's own import map, which you already write to import `@aparte/core`
by name. Nothing to configure: map `@huggingface/transformers` and it works.

The one page this cannot serve is one whose Content-Security-Policy forbids `blob:` in
`worker-src` (or `script-src`) — a cross-origin worker has no other way in. Serve the
package from your own origin there, and the provider constructs the worker directly.
:::

:::note[With a bundler, nothing to configure either]
The worker ships as `dist/worker.js` and is constructed from a literal
`new Worker(new URL('./worker.js', import.meta.url), { type: 'module' })` — the shape Vite
and webpack both detect. Your bundler therefore processes it as a module and resolves
`@huggingface/transformers` inside it, exactly as it does for your own code. You do not
need a worker loader, a `copy` rule, or an entry of your own.
:::

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

## Runners — what loads the model

The worker runs a **runner**: the piece that loads a model and drives it. Two ship with the
package, picked with `task`; a third option is a module of your own.

| `task` | loads | for |
|---|---|---|
| `'text-generation'` (default) | `pipeline('text-generation')` | any chat model — Qwen, SmolLM, Llama, Phi… |
| `'image-text-to-text'` | `AutoProcessor` + `AutoModelForImageTextToText` | vision models — whatever `AutoModelForImageTextToText` resolves (SmolVLM, Qwen2-VL, LFM2-VL, Gemma 3…); measured on SmolVLM |

A vision model reads the image parts of a message (`{ type: 'image', image: dataUrl }`) exactly
as the composer attaches them:

```ts
registerModel({
  id: 'HuggingFaceTB/SmolVLM-256M-Instruct',
  name: 'SmolVLM 256M',
  task: 'image-text-to-text',
  capabilities: ['streaming', 'vision'],
  // Three ONNX parts, three dtypes — the shape the model card recommends for WebGPU.
  dtype: { embed_tokens: 'fp16', vision_encoder: 'q4', decoder_model_merged: 'q4' },
});
```

Measured: SmolVLM-256M on WebGPU (Chromium, AMD Radeon 8060S): first load 7 s (download included), first token 3.7 s cold; Stop interrupts the model, not just the read.

Each runner is its own chunk, loaded only when a model asks for it. Both drop `tool_call` /
`tool_result` turns with one warning (tool syntax is per model family), and the text runner
**says so when it drops an image** — it never answers a photo it could not see as if it had.

### A runner of your own

Point `runner` at an ES module that exports `createRunner`; it wins over `task`. The worker
imports it and hands it the same Transformers.js instance the built-ins use, so a research-grade
model — a custom vision tower, an adapter you swap at runtime — fits without giving up the
provider's worker, queue, progress, cancel and cache:

```ts
registerModel({ id: 'my-org/my-model', name: 'Mine', capabilities: ['streaming'], runner: './runners/mine.js' });
```

```js
// runners/mine.js — served by your app; the worker imports it by URL
export async function createRunner(ctx) {
  // ctx.transformers is the Transformers.js the page installed or mapped — never import your own
  const { AutoTokenizer, AutoModelForCausalLM, TextStreamer } = ctx.transformers;
  const tokenizer = await AutoTokenizer.from_pretrained(ctx.modelId);
  const model = await AutoModelForCausalLM.from_pretrained(ctx.modelId, { dtype: ctx.dtype, device: ctx.device });
  return {
    async generate({ messages, options, emit }) {
      // messages arrive WITH their content parts — render them the way this model wants;
      // this one reads text, so the parts are flattened and tool turns left out
      const turns = messages
        .filter((m) => m.role === 'user' || m.role === 'assistant' || m.role === 'system')
        .map((m) => ({ role: m.role, content: typeof m.content === 'string' ? m.content : m.content.filter((p) => p.type === 'text').map((p) => p.text).join('') }));
      const inputs = tokenizer.apply_chat_template(turns, { add_generation_prompt: true, return_dict: true });
      const streamer = new TextStreamer(tokenizer, {
        skip_prompt: true, skip_special_tokens: true,
        callback_function: (text) => emit({ type: 'text', delta: text }),
      });
      await model.generate({ ...inputs, max_new_tokens: options.maxTokens ?? 512, streamer });
      // `done` is optional — the provider closes the stream when generate() resolves
    },
    // anything that is not a generation: the provider passes it through, untouched
    async command(name, payload) { if (name === 'adapter') { /* swap a LoRA, warm a cache… */ } },
    dispose() { model.dispose(); },
  };
}
```

`emit` speaks aparté's stream vocabulary (`text`, `thinking`, `tool_use`, `done`, `error`),
`signal` fires on Stop, `ctx.progress` (a `RunnerProgress`) / `ctx.warn` reach the page. The contract is
exported: `TransformersRunner`, `RunnerContext`, `RunnerGenerateInput`, `CreateRunner`, `RunnerModule` (what
the module exports), `BuiltInRunner` (the two `task` names) and `TransformersModule` (the type of
`ctx.transformers`).
`runnerCommand(modelId, name, payload)` reaches a runner's `command()` from the page, queued
behind the generates in flight.

## Managing downloads & cache

Downloading and status are **methods on the provider** you registered:

- `TransformersProvider.prepareModel(modelId, onProgress)` — download + load a model, reporting progress.

  A first load is tens or hundreds of megabytes, so `onProgress` is the whole point of
  calling it. It receives a `ModelLoadProgress` (exported by `@aparte/core`):

  ```ts
  onProgress({
    status: 'downloading',        // 'downloading' | 'loading' | 'cached' | 'ready' | 'error'
    file: 'model_q4.onnx',        // optional — absent between files, and on 'ready'
    progress: 42,                 // optional, and it is a PERCENTAGE: 0–100, not 0–1
    message: undefined,           // optional, human-readable
  });
  ```

  `downloading` arrives many times per file, `loading` once the bytes are in and the
  runtime is building the pipeline, `ready` last. `cached` means there was nothing to
  fetch. Drive a bar off `progress` and a caption off `file`.

- `TransformersProvider.getModelStatus(modelId)` — `'ready'` \| `'cached'` \| `'not-downloaded'`.

Cache and hardware are **standalone helpers** — import them from `@aparte/provider-transformers`:

- `listCachedModels()` / `deleteCachedModel(modelId)` — inspect and clear the on-disk cache.
- `setMaxCachedModels(n)` — cap how many models are kept (oldest evicted; `0` = unlimited).
- `detectHardware()` / `setComputeDevice('auto' | 'webgpu' | 'wasm')` — pick a device / default model by tier.
  Call `setHardwareTierModels({ low, mid?, high })` first — otherwise `detectHardware()`'s
  `recommendedModelId` is always `''`.

:::note
**Scope:** text and vision models through the built-in runners, anything else through a runner of
your own (above). Tool-calling for local models is model-specific (each family has its own format):
a conversation that already contains `tool_call` / `tool_result` turns still runs, those turns are
**dropped** from what the model sees, with one `console.warn` so the omission isn't silent — and a
text model attached an image says so the same way, instead of answering as if it had seen it.
:::
