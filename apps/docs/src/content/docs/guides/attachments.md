---
title: Attachments
description: File attachments in the aparté composer — the built-in picker, the programmatic API, and how files reach your provider.
sidebar:
  order: 6
---

The composer handles **file attachments** with one flag — and nothing shows the user a paperclip
until you set it.

## Turning them on

Two elements make the UI:

- **`<aparte-composer-add-attachment>`** — the picker button (opens the file dialog).
- **`<aparte-composer-attachments>`** — the chips row showing the pending files.

The default composer shell mounts **neither**. Add `attachments` and it mounts both, in their
canonical positions:

```html
<aparte-chat attachments></aparte-chat>
```

```tsx
<AparteChat attachments />           {/* React · Svelte · Vue */}
<aparte-chat attachments>            <!-- Angular -->
```

Composing your own composer? The flag doesn't apply — drop the two elements in wherever you
want them, as with any other primitive.

:::note[Why opt-in]
A picker is a promise: whatever the user attaches gets used. That promise is only kept if
something consumes the files. An `AparteClient` does (see [What gets sent](#what-gets-sent-to-the-model)),
but an app driving [its own loop](/guides/bring-your-own-loop/) has to read them from the send
event — and a loop that forwards only `content` drops them in silence, with the UI still showing
the file went out. Setting `attachments` is you saying the files are handled.
:::

## Programmatic API

The `<aparte-composer>` element exposes attachments directly:

```ts
composer.addAttachments(files);      // FileList | File[]
composer.removeAttachment(file);
composer.clearAttachments();
composer.attachments;                // File[] (current selection)
```

## Getting the files on send

When the user submits, the pending files ride along on the **`aparte-send`** event detail:

```ts
composer.addEventListener('aparte-send', (e) => {
  const { content, files } = e.detail;   // files?: File[]
});
```

In React that's just the `onMessageSent` prop:

```tsx
<AparteChat onMessageSent={(e) => { if (e.files) upload(e.files); }} />
```

To observe the pending selection live (e.g. to enable a send button), listen for
**`aparte-composer-change`** — its `detail.state.attachments` is the current `File[]`.

Driving your own loop? `filesToAttachments(files)` converts that `File[]` into the
`attachments` an `AparteChatMessage` renders — the same conversion the built-in send path
does, so your user bubble shows the chips instead of a bare line of text:

```ts
import { filesToAttachments } from '@aparte/core';

chat.appendMessage({
  id, role: 'user', content,
  ...(files?.length ? { attachments: filesToAttachments(files) } : {}),
});
```

## What gets sent to the model

Before the provider sees anything, `AparteClient` decides which pending files are inlined into
the request, via its `rawFileInject` option:

- **`'all'`** (default) — images *and* recognized text files (`.md`, `.json`, `.csv`, source
  code, `.env`, `.log`, …): images become image parts, text files are read client-side and
  injected **in full** as text.
- **`'images-only'`** — only images are inlined. Pair it with a `requestInterceptor` that
  retrieves relevant chunks (RAG) instead of flooding the context with whole files.
- **`'none'`** — nothing is inlined; your `requestInterceptor` owns all file handling.

:::caution[Text files are sent in full]
In the default `'all'` mode a dropped text file — a `.env` or a log included — goes to the
model verbatim. That's the intended batteries-included behavior for a user deliberately
attaching a file; if your host shouldn't forward such content (secrets, PII), pick
`'images-only'` or `'none'`, or veto individual files with `fileInjectFilter` (below).
:::

For per-file control on top of the mode, `fileInjectFilter` is called for each file the mode
would inject — return `false` to keep it out of the request (the file still rides on the
`aparte-send` event for your upload/RAG layer):

```ts
new AparteClient({
  // keep the inline UX, but never forward env files or keys
  fileInjectFilter: (f) => !/(^|\.)env$|\.(pem|key)$/i.test(f.name),
});
```

## Reaching the model

Whether files are actually sent to the model is the **provider's** job (multimodal support varies):
the OpenAI-compatible adapter maps image parts to the vendor's `image_url` format, for example. A
provider that doesn't support a given file type simply ignores it. See [Providers](/providers/).

Attachment status colors are themeable via the `--aparte-file-status-*` CSS variables (see
[Theming](/guides/theming/)).
