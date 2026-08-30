---
"@aparte/provider-transformers": patch
---

Register a model with `task: 'image-text-to-text'` to run a vision model in the browser, or point `runner` at a module of your own; a text model now says when it drops an image, and Stop honours `ctx.signal`.

The worker forced `pipeline('text-generation')` on every model: the `task` the main thread posted was never read, the public type made registering a vision model a TypeScript error, and image parts were flattened away on the main thread with no warning — a photo attached to a text model produced an answer that pretended to have seen it.

What changed, for the caller:

- `TransformersModelConfig.task` is optional and accepts `'text-generation'` (the default, unchanged) or `'image-text-to-text'` (`AutoProcessor` + `AutoModelForImageTextToText` — SmolVLM, Qwen2-VL, LFM2-VL, Gemma 3…). Transformers.js 4.x has no pipeline for that task, so the runner goes through the model classes the way the model cards do. Image parts reach the model as the composer attaches them; a turn without a picture goes through the tokenizer alone (the processor wants images — "hello" as a first message crashed a real SmolVLM until it did).
- `TransformersModelConfig.runner` names an ES module of your own exporting `createRunner(ctx)`; it wins over `task`. The worker imports it (URL resolved against the page) and hands it the same Transformers.js instance the built-ins use. `emit` speaks the stream vocabulary (`text`, `thinking`, `tool_use`, `done`, `error`), `signal` fires on Stop, `ctx.progress` / `ctx.warn` reach the page, `dispose()` runs on a model switch. New exports: `TransformersRunner`, `RunnerContext`, `RunnerGenerateInput`, `RunnerProgress`, `RunnerModule`, `CreateRunner`, `BuiltInRunner`, `TransformersModule`, and `runnerCommand(modelId, name, payload)` to reach a runner's `command()` from the page, queued behind the generates in flight.
- The text runner warns once when it drops image parts (naming the vision task), as it already did for tool turns.
- `chat()` reads `ctx.signal`: a user's Stop now interrupts the model, not just the local read (the contract said bridges MUST; this one read it nowhere). Abort and stream-cancel are one stop; a signal already aborted never posts the generate.

Each runner is its own chunk under `dist/assets/`, loaded when a model asks for it (a runner imports core for types only — the first build that took a helper from it shipped all of core in a 426 kB chunk; it is 2 kB). Measured on Chromium + WebGPU (AMD Radeon 8060S), page and package on two origins, Transformers.js 4.2.0 from jsDelivr: `HuggingFaceTB/SmolVLM-256M-Instruct` (fp16/q4/q4) loads in 7 s download included, answers "Rectangle, circle." to a red square with a blue circle in 3.7 s cold, and Stop ends the stream within two tokens; `SmolLM2-135M-Instruct` still streams and stops; a 20-line custom runner imported cross-origin drives the transcript and answers a `runnerCommand`.
