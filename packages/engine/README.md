# @aparte/engine

The **headless agent loop** behind `@aparte/*` — framework-agnostic, zero runtime
dependencies, runs in the browser or Node.

Its core export is **`runStreamAgent`**: a DOM-free structured-stream loop that turns a
transport's token stream into high-level run events (text, thinking, tool calls, artifacts),
drives the tool-calling loop (with optional human-in-the-loop approval), and reports usage.

`@aparte/core` embeds the same loop inline (`AparteClient._streamLoop`) so **core works
without this package**. `@aparte/engine` is the *recommended path*: inject `runStreamAgent`
via `AparteClientOptions.streamRunner` and core renders its events through
`createStreamAdapter`. Parity between the two is proven by this package's `stream-parity`
suite (it drives core's real `_streamLoop` and `runStreamAgent` against the same scripted
transport and asserts identical output).

`@aparte/core` is an **optional peer** — `runStreamAgent` and its parsers import nothing from
it; the orchestrator/memory helpers use core's config/types when present.

> Part of the [aparté](https://github.com/apartejs/aparte) monorepo. ESM-only.
