---
"@aparte/core": patch
---

The model picker now works with `new AparteClient({ keyResolver })` alone, and a key provider may return `{ apiKey, endpoint }` so the model list follows your endpoint. Nothing to change on your side; `aparteGlobalConfig.setKeyProvider()` behaves as before, and `AparteConfig.registerKeyProvider(provider)` is new if you want to add a key source of your own.

Two channels carry a provider's credentials, and `refreshProviderModels` — the model selector's only data path — could see neither properly.

`keyResolver` is what the providers guide teaches ("you hand it to each request via `keyResolver` on `AparteClient`"), with `setKeyProvider` called an alternative, and nothing told you to call both. But the resolver reached the chat only: `refreshProviderModels` read `config.getKey` alone, so `fetchModels` was called with `undefined` and returns `[]` for every cloud provider. An empty picker, a working chat, and no warning — it read as "the vendor returned nothing". The client now registers its resolver ON the config, so the capability is not hostage to the client (a page that constructs none still lists models), and one resolution order answers both questions: a registered resolver first, then `setKeyProvider` — the precedence the client already documented.

`AparteKeyProvider` was typed as returning a string, so the `{ apiKey, endpoint }` record the transport reads and `fetchModels` accepts could not travel on it. A consumer who points a preset at their own host — a corporate proxy, a self-hosted vLLM, an LM Studio box on another port — configures it as `endpoint`, and the chat honoured it while the model refresh sent `GET {vendor default}/models` carrying the key that host had been given. It travels now, on both channels.
