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
- **The agent can live elsewhere.** The loop can run on [your server](/guides/server-loop/),
  next to your tools, and an approval still reaches the person and survives a reload. An agent
  that runs its own loop plugs in through a runner: [AG-UI](/providers/agent/ag-ui/) (Agno,
  LangGraph, Mastra, CrewAI, Pydantic AI, TanStack AI) or an
  [n8n workflow](/providers/agent/n8n/). The chat draws the same thing either way.
- **Rich output is opt-in.** [Maths](/guides/math/), [diagrams](/guides/diagrams/),
  [charts](/guides/charts/) and [cards for a tool's result](/guides/cards/) each come from a
  plugin you add, so a page loads only what it uses. The sources a model cites are drawn as
  [citations](/guides/citations/) by the providers that receive them.

## What aparté is not

No routing, no sign-in, no settings screens, no backend, no database: those belong to your
product. Storage is an interface you implement —
[`AparteStorageAdapter`](/guides/conversation-persistence/). An adapter over the browser's
IndexedDB ships as an option; a backend never does.

## Where it stands

aparté is at 1.x. Every `@aparte/*` package is released together, at one version, and its
public surface follows semver: a [frozen](/reference/stability/) name keeps its name, and what
its documentation says it does, until 2.0. What changed, release by release, is in the
[changelog](/changelog/).

## When another library fits better

You only want visual building blocks and already have a chat runtime you like; or you are
all-in on one framework and want its idioms end to end rather than web components. If that
changes, every package here is MIT-licensed and works on its own — core alone, the engine
alone, or the whole set. [Compare](/compare/) puts it side by side with the others.
