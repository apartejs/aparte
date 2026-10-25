---
"@aparte/provider-openai-compat": minor
---

Errors a server sends mid-stream now surface as errors, a reply's finish reason is reported, and the context window of LM Studio, Ollama, llama.cpp and vLLM models is read.

Three changes, none of which asks you to touch your code:

- **Stream errors.** A server that answers `200` and then streams `data: {"error": {...}}` (LM Studio on a context overflow, OpenAI and vLLM mid-stream) used to end the turn on an empty `done`: an empty reply marked completed. The line is now an `error` event carrying the server's message, and the stream ends there without a `done`. The non-streaming path throws the same message for a `200` body that has `error` and no `choices`, where it returned `''`.
- **Finish reason.** The last non-null `finish_reason` travels on every `done` as `finishReason`: `stop`, `length`, `tool-calls` (`tool_calls` and `function_call`), `content-filter`, or `other` for anything else. A server that never says leaves it off.
- **Context window.** `fetchModels` read only `context_length`, so a local model had no `contextWindow`: the gauge never showed and compaction never triggered while the server truncated silently. It now reads `context_length`, `max_model_len`, `context_window` or `max_context_length` from the `/models` entry, and the new `server` option (`'lmstudio' | 'ollama' | 'llamacpp' | 'vllm'`) makes one extra request at the endpoint's origin for the window the server actually serves: LM Studio's `/api/v1/models` (a loaded model's `context_length`), Ollama's `/api/ps`, llama.cpp's `/props`. A failing probe leaves the models without a window, with one warning. A `contextWindow` you declare on a model in `models` wins over anything read.

The `LMSTUDIO` and `OLLAMA` presets now set `server`, and two presets are new: `LLAMACPP` (`http://localhost:8080/v1`) and `VLLM` (`http://localhost:8000/v1`).

An unloaded LM Studio model, and an Ollama model not currently loaded, get no window rather than the trained maximum: that number is not what the server will run with, and a gauge drawn against it is worse than none.
