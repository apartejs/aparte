---
title: Why aparté
description: What aparté sets out to be, the choices it is built on, and when another library fits better.
---

aparté is a chat runtime that stays a library. The chat, its streaming, its tools and its loop
come as web components you place in any page, with no framework, no backend and no vendor
imposed — and you take as much of it as you need.

## The choices it is built on

- **Web components, with one dependency of its own.** `@aparte/core` is plain custom elements,
  and its only dependency is `@aparte/engine`, the agent loop, released with it. Nothing from
  outside has to match your stack's versions, and the
  [React, Vue, Svelte and Angular packages](/frameworks/) are thin bridges over the same
  elements.
- **The format is not the transport.** A provider knows how to talk to a model; a transport
  decides where the request goes and who holds the key —
  [the browser, or your server](/guides/backend-transport/). The chat is the same either way.
- **The loop is a part, not a lock-in.** `AparteClient` drives the loop in
  [`@aparte/engine`](/guides/engine/); the engine also runs alone, on a server or out of the
  page. Or keep your own loop and [stream its replies](/guides/bring-your-own-loop/) into the
  chat.

## What aparté is not

No routing, no sign-in, no settings screens, no database: those belong to your product.
Storage is an interface you implement — [`AparteStorageAdapter`](/guides/conversation-persistence/)
— not a backend that comes with it.

## Where it stands

aparté is in beta. Every `@aparte/*` package is a `0.x`, released together, and its public
surface is [frozen](/reference/stability/); what changed, release by release, is in the
[changelog](/changelog/).

## When another library fits better

You only want visual building blocks and already have a chat runtime you like; or you are
all-in on one framework and want its idioms end to end rather than web components. If that
changes, every package here is MIT-licensed and works on its own — core alone, the engine
alone, or the whole set. [Compare](/compare/) puts it side by side with the others.
