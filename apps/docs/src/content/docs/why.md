---
title: Why aparté
description: What aparté is, the architectural bets behind it, and when (not) to pick it.
---

There are two established ways to put an AI chat in front of users. **UI kits** give you
polished message bubbles and composers — and leave the streaming, the agent loop, the tool
calls and the provider wiring entirely to you. **Full-stack SDKs** give you the plumbing —
tied to one framework, and often to one vendor's way of doing things.

aparté takes the third path: **a complete chat runtime that is still just a library.**

## Batteries included

Register a provider, pick a transport, start a client — a real streamed chat in ~15 lines:

```ts
import { aparteGlobalConfig, AparteClient, AparteDirectTransport, registerDefaultRenderers } from '@aparte/core';
import { createOpenAICompatProvider, presets } from '@aparte/provider-openai-compat';
import '@aparte/core/styles.css';

registerDefaultRenderers();
aparteGlobalConfig.registerAIProvider(createOpenAICompatProvider(presets.OPENROUTER));
aparteGlobalConfig.setTransport(new AparteDirectTransport({ byok: true }));   // key stays client-side
new AparteClient({
  keyResolver: () => localStorage.getItem('openrouter.key') ?? undefined,
}).start();

document.body.innerHTML = '<aparte-chat style="height: 600px"></aparte-chat>';
```

That includes what the snippet doesn't show: token streaming with typed segments (text,
thinking, code, tool calls — and artifacts, through a plugin), the [tool-calling loop with human-in-the-loop
approval](/guides/tools/), [retry/edit with conversation branching](/guides/conversations-branching/),
attachments, markdown/highlight plugins, and localization.

## The architectural bets

- **Web components, zero third-party dependencies.** `@aparte/core` is vanilla custom elements
  whose only dependency is `@aparte/engine`, the agent loop, versioned with it — nothing from
  outside to version-align with your stack. The
  [React / Vue / Svelte / Angular wrappers](/frameworks/) are thin bridges over one shared,
  compile-enforced imperative API, so the same engine renders identically across all four
  (plus plain HTML).
- **Transport ≠ format.** *How to talk to a vendor* (the format adapter) is separate from
  *where the request goes and who holds the key* ([the transport](/guides/backend-transport/)):
  browser-direct BYOK, or your `/api/chat` with the key server-side — same UI either way.
- **The loop is a seam, not a lock-in.** Core runs a full agent loop standalone;
  [`@aparte/engine`](/guides/engine/) is that same loop headless (proven identical by a parity
  suite) for server-side or out-of-process use. Or skip both and
  [bring your own loop](/guides/bring-your-own-loop/) — the chat renders display-only.

## What aparté is not

No routing, no auth, no settings screens, no database. Those belong to *your* product —
a library that imposes them ages badly. Persistence is an interface you can implement
([`AparteStorageAdapter`](/guides/conversation-persistence/)), not a bundled backend.

## Where it is in its life

**Alpha.** Every `@aparte/*` package is on npm at a plain `0.x`, released in lockstep,
and the API can still change before the first stable cut. Pre-1.0 here means what it
says: a rename lands as a rename, in the changeset that describes it, without a
deprecated alias kept alongside — so a minor can ask you to change a line. What changed
when is in the [changelog](/changelog/), version by version.

That is the trade being offered. The surface has been stable in practice — the eighteen
element tags have not changed name across four releases — but "in practice" is not a
promise, and pinning an exact version is reasonable until it is one.

## When not to pick it

Honest cases for something else: you only want visual building blocks and already have a
chat runtime you like; or you're all-in on one framework's ecosystem and want its idioms
end-to-end rather than web-component interop. If either changes, the pieces here are
MIT-licensed and consumable à la carte — core alone, engine alone, or the whole thing.
