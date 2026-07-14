---
title: Getting started
description: Install @aparte/core and render your first streaming chat — vanilla web components, no framework, no backend required.
sidebar:
  order: 1
---

`@aparte/core` is a set of **framework-agnostic web components** for AI chat. You
drop `<aparte-*>` elements onto a page, stream tokens into them, and style
everything with CSS variables — no framework, and zero runtime dependencies.

By the end of this page you'll have a working chat that streams a reply, running
entirely in the browser.

## Install

```bash
npm install @aparte/core
```

## Register the components

Import the package once (it registers the `<aparte-*>` custom elements), pull in
the stylesheet, and call `registerDefaultRenderers()`.

```ts
import '@aparte/core';               // registers the <aparte-*> custom elements
import '@aparte/core/styles.css';    // theme variables + component styles
import { registerDefaultRenderers } from '@aparte/core';

registerDefaultRenderers();          // turns raw text/markdown into rendered bubbles
```

:::caution
`registerDefaultRenderers()` is **required** when you use core on its own —
without it, bubbles render empty.
:::

## Add the markup

**`<aparte-chat>`** is the container. It lays out a message viewport and a composer
as a flex column, and — with `center-empty` — keeps the composer centered as a
welcome state until the first message, then slides to the normal layout. Size it
(a height, or let it fill a parent) and you're done.

Left empty, it fills in a default composition:

```html
<aparte-chat center-empty placeholder="Say something…" style="height: 600px"></aparte-chat>
```

Need full control — a custom composer, extra buttons? Put your own primitives
**inside** the same element. It still lays them out and runs `center-empty`, so you
keep the behaviour without a hand-written container:

```html
<aparte-chat center-empty style="height: 600px">
  <aparte-chat-viewport></aparte-chat-viewport>

  <aparte-composer>
    <div class="aparte-composer-shell">
      <div class="aparte-composer-row">
        <aparte-composer-input placeholder="Say something…" style="flex:1"></aparte-composer-input>
        <aparte-composer-send></aparte-composer-send>
      </div>
    </div>
  </aparte-composer>
</aparte-chat>
```

`center-empty` is opt-in — drop it and the composer sits at the bottom from the
start. The `.aparte-composer-shell` / `.aparte-composer-row` helpers give the
bordered input-with-a-send-button look; the composer itself is headless.

## Make it stream

The composer fires an **`aparte-send`** event when the user submits — it bubbles, so
you can listen on `<aparte-chat>`. Reach the message list via `chat.viewport`, add
the user's message, then stream an assistant reply in.

Three viewport methods are all you need:

- `appendMessage({ id, role, content, timestamp })` — create a bubble
- `appendToken(id, chunk)` — stream text into it, token by token
- `completeMessage(id)` — mark it done (stops the streaming caret)

```ts
const chat = document.querySelector('aparte-chat');
const viewport = chat.viewport;

let n = 0;

// Stream a string into a fresh assistant bubble, a few characters at a time.
function streamReply(text) {
  const id = 'a' + ++n;
  viewport.appendMessage({ id, role: 'assistant', content: '', timestamp: Date.now() });

  const tokens = text.split(/(\s+)/);       // keep the whitespace as its own tokens
  let i = 0;
  const timer = setInterval(() => {
    if (i >= tokens.length) {
      clearInterval(timer);
      viewport.completeMessage(id);
      return;
    }
    viewport.appendToken(id, tokens[i++]);
  }, 40);
}

chat.addEventListener('aparte-send', (e) => {
  const text = e.detail.content;

  // 1. Echo the user's message into the conversation.
  viewport.appendMessage({ id: 'u' + ++n, role: 'user', content: text, timestamp: Date.now() });

  // 2. Reply. Here we fake it; next you'll wire a real model.
  streamReply(`You said: “${text}”. Now wire a transport to get a real answer.`);
});
```

*(Using the primitives instead? Same code — just `document.querySelector('aparte-chat-viewport')`
for the viewport and listen on the composer.)*

That's a complete, working chat — no backend, no keys. Type a message and watch
the reply stream in.

:::note
Streamed replies land in `message.segments` (typed text / code / thinking
blocks), not `message.content`. You only need to know this if you render your own
bubbles — the default renderers handle it for you.
:::

## Wire a real model

Faking the reply is fine for a first look. To talk to a real LLM, you configure core
with two things and let **`AparteClient`** drive the streaming loop for you:

1. **A provider** — the wire-format adapter for your model (an opt-in
   `@aparte/provider-*` package), registered with `AparteConfig.registerAIProvider(…)`.
2. **A transport** — *where* the request goes and *how* the key is handled:
   - **`DirectTransport`** — the browser talks to the provider directly (bring-your-own-key
     or a local model): `AparteConfig.setTransport(new DirectTransport({ byok: true }))`.
   - **`BackendTransport`** — the browser calls *your* endpoint, and the key stays
     server-side.

Once a provider and transport are set, **constructing an `AparteClient` is enough** —
it listens for `aparte-send` (and `aparte:retry`, `aparte:edit`) globally and streams
typed segments from the provider into your bubbles. No `aparte-send` handler of your
own, no manual `appendToken`.

Provider adapters ship as opt-in `@aparte/provider-*` packages — see the
**[Providers](/providers/)** section for the OpenAI-compatible adapter (OpenAI, Mistral, OpenRouter,
Groq, LM Studio, Ollama…), the Vercel AI SDK bridge (Anthropic, Google, 25+ vendors), and the
in-browser Transformers.js provider. You can also register any object implementing the
`AparteAIProvider` interface yourself.

## Next steps

- **[Theming](/guides/theming)** — restyle everything through CSS variables, no forking.
- **[Customization](/guides/customization)** — icons, render hooks, action registries.
- **[Conversations & branching](/guides/conversations-branching)** — retry / edit, branches, persistence.
- **[Providers](/providers/)** — connect a real model: OpenAI-compatible, the AI SDK bridge, or in-browser Transformers.js.
- **[The agent engine](/guides/engine)** — the headless `runStreamAgent` loop and the `streamRunner` seam.
