---
title: The agent engine
description: "@aparte/core runs the agent loop inline out of the box; @aparte/engine is the same loop, headless and reusable — inject runStreamAgent via the streamRunner seam."
sidebar:
  order: 5
---

`@aparte/core` already runs a full **agent loop**: when you drive a chat with `AparteClient`,
it streams the model, splits the reply into segments (text, thinking, tool calls, artifacts),
runs the tool-calling loop, and reports usage — all inline (`AparteClient._streamLoop`). **Core
works without any other package.**

`@aparte/engine` is that *same loop*, extracted as a **headless, framework-agnostic** function:
**`runStreamAgent`**. It has zero runtime dependencies, touches no DOM, and runs in the browser
or in Node — so a backend can run the loop server-side, and both paths are provable to behave
identically.

## When you'd reach for it

- You run the agent loop **on a server** (your `/api/chat`) and want the exact same behaviour as
  the in-browser client.
- You want one **audited, tested** loop shared across surfaces instead of two implementations.

If neither applies, you don't need it — core's inline loop is the default.

## The seam

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

With no `streamRunner`, the inline `_streamLoop` runs (the default). With one, the engine runs the
loop and core renders it — same messages, same events, same DOM output.

`@aparte/engine` declares `@aparte/core` as an **optional peer**: `runStreamAgent` and the parsers
need nothing from core; only the higher-level orchestrator/memory helpers use core's config when
present.

## Proven parity

The two paths aren't "meant" to match — it's tested. The engine's **`stream-parity`** suite drives
core's real `_streamLoop` and `runStreamAgent` (through the real `createStreamAdapter`) against the
same scripted transport and asserts an identical call sequence and usage across nine scenarios
(plain text, thinking, human-in-the-loop tool approve/reject, streamed and one-shot artifacts,
multi-phase pipelines, forced tool calls). So the seam is a drop-in, not an approximation.
