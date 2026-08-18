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

## The pattern

1. Listen to `onMessageSent` for the user's message and forward it to your loop. The user bubble
   is appended **automatically** on send — don't add it yourself.
2. When your loop starts answering, `appendMessage` an **empty assistant message** with a fresh id.
3. `injectTokenStream(id, tokens)` with your token source.

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

:::caution[Append before injecting]
If the `messageId` doesn't exist yet, the viewport auto-creates an empty assistant message — but
only in its **internal** repo, not in your framework's message state. In a wrapper, always
`appendMessage` explicitly first (step 2 above) so both stay in sync.
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

## What you give up

Display-only means the pieces `AparteClient` orchestrates don't run in the page: no built-in
tool-approval flow, no retry/edit re-sending, no request building. Your loop owns those. For
tool-call pills, thinking sections and other rich segments, `addSegment` / `appendToSegment` /
`updateSegment` (same imperative API) stream structured segments the same way
`injectTokenStream` streams plain text.
