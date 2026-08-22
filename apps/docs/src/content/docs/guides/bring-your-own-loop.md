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

## What you give up

Display-only means the pieces `AparteClient` orchestrates don't run in the page: no built-in
tool-approval flow, no retry/edit re-sending, no request building. Your loop owns those.

Concretely, for retry and edit: the **buttons exist**, and clicking one emits `aparte-retry`
/ `aparte-edit` and nothing else. Nobody re-sends, and on edit the editor closes and the
original text comes back. That is why core ships both **off** — so a display-only
integration shows no button it can't honour. Either handle those two events in your loop and
switch them on:

```ts
AparteConfig.setBubbleActions({ retry: true, edit: true });
```

…or leave them off, which is the default and costs you nothing. Same story for the ⓘ details
popover and the image-tile preview — see
[What ships enabled](/guides/customization/#what-ships-enabled). For
tool-call pills, thinking sections and other rich segments, `addSegment` / `appendToSegment` /
`updateSegment` (same imperative API) stream structured segments the same way
`injectTokenStream` streams plain text.
