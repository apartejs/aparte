---
"@aparte/engine": minor
---

The built-in `create_artifact` is gone from the loop, with the `artifact-ready` run event and `deriveArtifactKind`: a model calling `create_artifact` now reaches a registered tool of that name or gets "unknown tool" like any other call. Install `@aparte/plugin-artifacts` (`setupArtifacts()`) to register the tool, or register your own.

The name was compared in the loop and dispatched before the tool path — no `tool-start`, no approval gate, no handler, a result of its own — the fast path that once orphaned the next tool's result. A tool is a tool: it goes through the gate (a policy may class writing a document as a `write`), the handler and the envelope, and its result reaches the renderer as `structuredResult`. `idGen` keeps its one remaining use, the synthetic call of a forced `toolChoice`.
