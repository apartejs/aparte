---
title: The agent engine
description: "@aparte/engine is the headless, zero-dependency agent loop — runStreamAgent, the loop core drives via the streamRunner seam, plus the agnostic conversation compactor."
sidebar:
  order: 5
---

`@aparte/core` already runs a full **agent loop**: when you drive a chat with `AparteClient`,
it streams the model, splits the reply into segments (text, thinking, tool calls, artifacts),
runs the tool-calling loop, and reports usage — all inline. **Core works without this package.**

`@aparte/engine` is that loop as a **headless, framework-agnostic** package: zero runtime
dependencies, no DOM, runs in the browser or Node. Its headline export, **`runStreamAgent`**, is
the exact loop core embeds inline — extracted so a backend can run it server-side with *provably*
identical behaviour.

It is deliberately **just the loop core drives, plus the agnostic conversation compactor**.
Opt-in *tools* (ask-question, RAG, skills, code execution) belong in `plugins/*`; product
behaviour (memory, intent orchestration) and the not-yet-wired text agent loop live elsewhere.
None of that ships here.

## Install

```bash
npm install @aparte/engine
```

`@aparte/core` is an **optional peer**: `runStreamAgent` and the parsers need nothing from it, so
you can install `@aparte/engine` alone. If you wire it into core's client (below) you already have
`@aparte/core`; otherwise `npm install @aparte/core @aparte/engine`. ESM-only (like the rest of
`@aparte/*`); CJS consumers use `await import()`.

## What's in it

| Area | Exports | Status |
|------|---------|--------|
| **Structured-stream loop** | `runStreamAgent`, `StreamRunEvent`, the artifact-XML parser | Ready — the seam below |
| **Context compaction** | `compactConversation` + token-budget / sliding-window helpers | Ready |

Everything is a plain function or class — no globals, no side effects (`sideEffects: false`), fully
tree-shakeable, so you pull in only what you use.

## The primary use: the `streamRunner` seam

Core stays the zero-dependency leaf: it **never imports `@aparte/engine`**. Instead, `AparteClient`
exposes an injection point, `streamRunner`. Give it `runStreamAgent` and the client delegates its
loop to the engine, rendering the engine's events through core's `createStreamAdapter`:

```ts
import { AparteClient } from '@aparte/core';
import { runStreamAgent } from '@aparte/engine';

const client = new AparteClient({
  // …your transport / config…
  streamRunner: runStreamAgent,   // delegate the loop to the engine
});
```

With no `streamRunner`, the inline loop runs (the default). With one, the engine runs the loop and
core renders it — same messages, same events, same DOM output.

## Proven parity

The two paths aren't "meant" to match — it's tested. The engine's **`stream-parity`** suite drives
core's real inline loop and `runStreamAgent` (through the real `createStreamAdapter`) against the
same scripted transport and asserts an identical call sequence and usage across nine scenarios
(plain text, thinking, human-in-the-loop tool approve/reject, streamed and one-shot artifacts,
multi-phase pipelines, forced tool calls). So the seam is a drop-in, not an approximation.
