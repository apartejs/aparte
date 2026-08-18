---
title: Attachments
description: File attachments in the aparté composer — the built-in picker, the programmatic API, and how files reach your provider.
sidebar:
  order: 6
---

The composer handles **file attachments** out of the box — no extra wiring.

## Built-in UI

The default composer shell already renders the two attachment elements:

- **`<aparte-composer-add-attachment>`** — the picker button (opens the file dialog).
- **`<aparte-composer-attachments>`** — the chips row showing the pending files.

So a plain `<aparte-chat>` (or a framework `<AparteChat>`) supports attaching files with zero
config. Composing your own composer? Drop those two elements in where you want them.

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
`'images-only'` or `'none'`, or vet files in a `requestInterceptor`.
:::

## Reaching the model

Whether files are actually sent to the model is the **provider's** job (multimodal support varies):
the OpenAI-compatible adapter maps image parts to the vendor's `image_url` format, for example. A
provider that doesn't support a given file type simply ignores it. See [Providers](/providers/).

Attachment status colors are themeable via the `--aparte-file-status-*` CSS variables (see
[Theming](/guides/theming/)).
