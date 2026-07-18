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

## Reaching the model

Whether files are actually sent to the model is the **provider's** job (multimodal support varies):
the OpenAI-compatible adapter maps image parts to the vendor's `image_url` format, for example. A
provider that doesn't support a given file type simply ignores it. See [Providers](/providers/).

Attachment status colors are themeable via the `--aparte-file-status-*` CSS variables (see
[Theming](/guides/theming/)).
