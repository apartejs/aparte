---
title: Bring your own loop
description: Drive <aparte-chat> display-only from an external agent loop — appendMessage + injectTokenStream, no AparteClient.
sidebar:
  order: 12
---

Everything so far assumed `AparteClient` runs the agent loop in the page. But sometimes the loop
lives **somewhere else**: a backend you fully own, a worker, or an Electron main process talking to
a local model. The chat component then becomes **display-only** — your code pushes messages and
tokens in, and aparté renders, streams, scrolls and brands them exactly as if the client were
driving.

No `AparteClient`, no provider, no transport. Two methods from the
[imperative API](/frameworks/) (identical on all four wrappers) do all the work:

- `appendMessage(message)` — add a message to the thread.
- `injectTokenStream(messageId, tokens)` — stream an `AsyncIterable<string>` into a message,
  token by token, with the live-streaming UI (cursor, auto-scroll). Resolves when the iterable
  completes; `stopTokenStream()` cancels.

:::note[Renderers install themselves]
Rich replies are made of **segments** (text, thinking, code, tool calls…), and each
one needs a renderer. Core installs its built-in set the first time a segment
arrives, so this path needs no setup call — you'll see the real content, not
`[Unknown segment type: text]`.

This used to be a trap worth naming: `registerDefaultRenderers()` had exactly one
caller, `new AparteClient()` — the object this page tells you not to construct. A
display-only app got working bubbles, working streaming, working scroll, and no
content, which reads as a bug in your own loop. If you're on an older version, call
it once at startup:

```ts
import { registerDefaultRenderers } from '@aparte/core';
registerDefaultRenderers();
```

Registering your own renderer for a type still wins — the built-in sweep only fills
what nobody claimed. See [Custom segment types](/guides/customization/#custom-segment-types).
:::

## The pattern

1. Listen to `onMessageSent` for the user's message and forward it to your loop. The user bubble
   is appended **automatically** on send — don't add it yourself.
2. When your loop starts answering, `appendMessage` an **empty assistant message** with a fresh id.
3. `injectTokenStream(id, tokens)` with your token source.

<!-- doc-check: skip excerpt — `myAgentLoop` is the reader's own loop, which is the whole subject of the page -->
```tsx
import { useCallback } from 'react';
import { AparteChat, useAparteChat } from '@aparte/react';
import '@aparte/core/styles.css';

export function Chat() {
  const chat = useAparteChat();

  const onMessageSent = useCallback(async (event: { content: string }) => {
    const id = crypto.randomUUID();
    // Explicit append BEFORE injecting — see the caveat below.
    chat.ref.current?.appendMessage({
      id, role: 'assistant', content: '', timestamp: Date.now(),
    });
    await chat.ref.current?.injectTokenStream(id, myAgentLoop(event.content));
  }, [chat.ref]);

  return (
    <AparteChat
      ref={chat.ref}
      messages={chat.messages}
      onMessagesChange={chat.setMessages}
      onMessageSent={onMessageSent}
    />
  );
}
```

`myAgentLoop` is any `AsyncIterable<string>` — an async generator over a fetch stream, a model
SDK, whatever produces tokens.

That empty assistant message from step 2 needs no `status`: an assistant message with no status
and nothing in it *is* a reply on its way, so the bubble shows the [waiting
indicator](/guides/customization/#the-waiting-state) and keeps its action bar away until the
first token. As the stream runs, your framework's message list is kept in sync (once per frame),
so `getMessages()`, persistence and a [custom bubble](/guides/customization/#custom-bubbles) all
see the text — not just the DOM.

:::caution[Append before injecting]
If the `messageId` doesn't exist yet, the viewport auto-creates an empty assistant message — but
only in its **internal** repo, not in your framework's message state. In a wrapper, always
`appendMessage` explicitly first (step 2 above) so both stay in sync.
:::

:::caution[Attachments: only enable them if your loop consumes them]
The default composer has **no** file picker; `attachments` adds it (see
[Attachments](/guides/attachments/)). Leave it off unless your loop reads the files from the
send event — `detail.files`, or `event.files` in the wrappers. Without an `AparteClient`
nothing consumes them for you, so a loop that forwards only `content` **discards them
silently** while the UI suggests they were sent. When you do handle them,
`filesToAttachments(files)` turns them into the `attachments` your user bubble renders.
:::

Your own controls go **in** the composer, not in a bar below the chat: the toolbar row takes
a mode picker, a model selector or a token counter. Driving the loop yourself is exactly the
case where you have such controls — see
[The composer toolbar](/guides/customization/#the-composer-toolbar).

## Richer replies: segments instead of plain text

`injectTokenStream` writes plain text into a message's `content`. For a thinking block,
a tool pill or anything the bubble renders as a typed block, stream **segments** instead:

```ts
chat.ref.current?.addSegment({ id: 'think-1', type: 'thinking', content: '' });
for await (const chunk of reasoning) chat.ref.current?.appendToSegment('think-1', chunk);
```

`appendToSegment` writes each chunk straight into the bubble and syncs the framework's
message list once per frame, so a fast local model costs roughly one render per frame
rather than one per token — you don't need your own batching layer.

:::note[Segments and `content` don't mix]
As soon as a message has segments, the bubble stops rendering its plain `content`. So a
message you filled with `injectTokenStream` can't also show a `thinking` segment — give
the answer its own `text` segment if you need both in one message.
:::

## Push-based sources: the queue adapter

`injectTokenStream` *pulls* from an iterable, but IPC-style sources *push* events at you
(Electron `ipcRenderer`, WebSocket, `postMessage`). Bridge with a small async queue:

```ts
function createTokenQueue() {
  const buffer: string[] = [];
  let notify: (() => void) | null = null;
  let done = false;
  return {
    push(token: string) { buffer.push(token); notify?.(); },
    end() { done = true; notify?.(); },
    async *stream(): AsyncGenerator<string> {
      for (;;) {
        while (buffer.length) yield buffer.shift()!;
        if (done) return;
        await new Promise<void>((r) => { notify = r; });
        notify = null;
      }
    },
  };
}
```

Wire it to the pushing side, hand `queue.stream()` to `injectTokenStream`:

```ts
const queue = createTokenQueue();
window.myBridge.onToken((t) => queue.push(t));   // e.g. an Electron preload bridge
window.myBridge.onDone(() => queue.end());

chat.ref.current?.appendMessage({ id, role: 'assistant', content: '', timestamp: Date.now() });
await chat.ref.current?.injectTokenStream(id, queue.stream());
```

Starting a new `injectTokenStream` cancels the previous one, and `stopTokenStream()` cancels
explicitly (a stop button) — the source iterable is `return()`ed, so a generator's `finally`
runs and can tear down the underlying request.

## Running aparté's own loop out of process

If the external loop is yours to write, you don't have to reinvent it:
[`runStreamAgent` from `@aparte/engine`](/guides/engine/) is the exact agent loop core runs
inline — headless, zero dependencies, no DOM. It runs fine in Node, a worker, or an Electron
main process; forward its emitted text over your bridge and inject it here.

## The pieces core exports for this

Driving your own loop means doing by hand what `AparteClient` does for you. These are
exported so you do not have to reimplement them:

| Export | What it does | When you want it |
| --- | --- | --- |
| `AparteStreamParser` | Incrementally splits a model's text into segments — text, code fences, thinking blocks, `<artifact>` tags | You are feeding raw deltas and want the same rendering the client produces |
| `parseMarkdownToSegments` | The one-shot version of the above, for a complete reply | You already have the whole answer (a non-streaming call, or replaying history) |
| `contentToText` | Flattens `string \| AparteContentPart[]` to its text | Your transport or logs need the text of a multimodal message |
| `deriveArtifactKind` | Maps a MIME type to a short artifact kind (`html`, `svg`, `js`, …) | You are building artifact segments yourself |
| `readableToAsyncIterable` | Wraps a `ReadableStream` so `for await` works, honouring an `AbortSignal` | You are consuming a provider's `parseStream` directly — Chromium does not async-iterate streams |
| `registerAllComponents` | Touches every element class so a bundler cannot tree-shake the `customElements.define` side effects away | Your build is aggressive, or you load `@aparte/core` through a dynamic `import()` |
| `AparteChatHost` | The streaming / branch / host-method orchestration the four wrappers all bind to — everything `AparteClient` does minus the transport | You are writing a fifth framework binding, or driving core from a framework we do not ship |
| `populateBubbleFromMessage` | Fills an `<aparte-chat-bubble>` from an `AparteMessage` — segments, attachments, sibling nav, action bar | You render bubbles yourself instead of letting the viewport own them |
| `parseAparteEventStream` | Reads the SSE wire format `createAparteChatHandler` emits back into `AparteStreamEvent`s | You wrote your own client against an aparté backend endpoint |

Wiring your own binding starts here — no `AparteClient`, so nothing is hostage to it:

```ts
import {
  registerAllComponents,
  AparteChatHost,
  populateBubbleFromMessage,
  parseAparteEventStream,
  readableToAsyncIterable,
  uuid,
  type AparteMessage,
} from '@aparte/core';

registerAllComponents();                       // safe to call more than once

// The host takes its binding up front: you own the message list, it drives the DOM.
const chat = document.querySelector('aparte-chat')!;
let messages: AparteMessage[] = [];

const host = new AparteChatHost({
  hostId: uuid(),
  host: chat,
  viewport: chat.viewport,
  getMessages: () => messages,
  setMessages: (next) => { messages = next; },
  // Required: run `cb` once your framework has painted. With no framework, the
  // next frame is the honest answer — the host uses it to measure, not to poll.
  afterRender: (cb) => void requestAnimationFrame(() => cb()),
  onMessagesChange: (next) => void next,       // your framework's re-render
});
const release = host.bind();                   // returns its own unbind

// Rendering a bubble yourself instead of letting the viewport own it:
const bubble = document.createElement('aparte-chat-bubble');
populateBubbleFromMessage(bubble, { id: 'a1', role: 'assistant', content: 'hi', timestamp: Date.now() });

// Reading an aparté backend's SSE stream without AparteClient. Note the wrapper:
// parseAparteEventStream returns a ReadableStream, and Chromium does not
// async-iterate those — the signal is how a user's "stop" cuts the read.
async function consume(body: ReadableStream<Uint8Array>, signal: AbortSignal) {
  for await (const event of readableToAsyncIterable(parseAparteEventStream(body), signal)) void event;
}
void consume;

release();
```

```ts
import { AparteStreamParser, contentToText } from '@aparte/core';

const parser = new AparteStreamParser();
for (const delta of ['Here: ', '```', 'ts\n', 'const x = 1;\n', '```']) {
  const { segments } = parser.parse(delta);
  for (const segment of segments) void segment; // render as they complete
}
const trailing = parser.finalize();            // flush whatever is still buffered
void trailing;

void contentToText([{ type: 'text', text: 'hello' }]);   // 'hello'
```

### Reasoning models: `thinkingDelimiters`

By default the parser recognises `<think>…</think>` **and** `<thinking>…</thinking>`.
Models that mark their reasoning differently need the delimiters spelled out — pass one
pair, or several. Passing any **replaces** the defaults, so re-list the ones you still
want:

```ts
import { AparteStreamParser } from '@aparte/core';
import type { AparteThinkingDelimiterPair } from '@aparte/core';

const pairs: AparteThinkingDelimiterPair[] = [
  { start: '<think>', end: '</think>' },
  { start: '<|begin_of_thought|>', end: '<|end_of_thought|>' },
];

const parser = new AparteStreamParser({ thinkingDelimiters: pairs });
void parser;
```

Matched content becomes a `thinking` segment, which renders collapsed instead of as
part of the reply.

:::note[Only on this path]
`AparteClient` does not forward parser options today, so `thinkingDelimiters` is
reachable only when you construct the parser yourself — that is, on this page's path.
There is no response-side interceptor to rewrite the deltas on the way in either
(`requestInterceptor` only touches the outgoing request). So if you use the client and
your model marks reasoning with something other than `<think>` or `<thinking>`, the
options are to normalise the delimiters in your transport before core sees them, or to
drive the loop yourself as above.
:::

## What you give up

Display-only means the pieces `AparteClient` orchestrates don't run in the page: no built-in
tool-approval flow, no retry/edit re-sending, no request building. Your loop owns those.

Concretely, for retry and edit: the **buttons exist**, and clicking one emits `aparte-retry`
/ `aparte-edit` and nothing else. Nobody re-sends, and on edit the editor closes and the
original text comes back. That is why core ships both **off** — so a display-only
integration shows no button it can't honour. Either handle those two events in your loop and
switch them on:

```ts
aparteGlobalConfig.setBubbleActions({ retry: true, edit: true });
```

…or leave them off, which is the default and costs you nothing. Same story for the ⓘ details
popover and the image-tile preview — see
[What ships enabled](/guides/customization/#what-ships-enabled). For
tool-call pills, thinking sections and other rich segments, `addSegment` / `appendToSegment` /
`updateSegment` (same imperative API) stream structured segments the same way
`injectTokenStream` streams plain text.
