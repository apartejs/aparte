# @aparte/plugin-artifacts

Artifacts for [aparté](https://github.com/apartejs/aparte): a document the model produces — a page, a
component, a script, an SVG, a Markdown note, a spreadsheet — shown as a Code/Preview card in the
transcript. An artifact is a convention an app teaches its model, not something a model does by
nature, so the whole convention lives here: the `create_artifact` **tool** the model calls, the
**card** that renders its result, and the `<artifact>` **tag grammar** for a model that writes one
in its prose.

<img src="https://apartejs.dev/shots/artifacts.png" alt="An artifact card with Code and Preview tabs, in an aparté chat" width="420">

```bash
npm install @aparte/plugin-artifacts @aparte/core
```

```ts
import { setupArtifacts } from '@aparte/plugin-artifacts';

setupArtifacts(); // registers the tool, its renderer, the grammar and the segment renderer
```

`@aparte/core` is the only **peer dependency**.

## Options

```ts
setupArtifacts({
  name: 'create_artifact',        // the tool's name as the model sees it
  systemPrompt: false,            // your own string, or false to send none
  tag: 'artifact',                // the tag recognised in the prose; false for none
  preview: true,                  // false: no Preview tab; a function: your own srcdoc builder
  onBinary: async (artifact) => { // pdf / xlsx / docx: produce the file from the model's source
    const { buffer, filename } = await runInYourSandbox(artifact.content);
    return { buffer, filename, mime: artifact.mimeType };
  },
});
```

A second argument scopes everything to one `AparteConfig` instead of the global one. The call
returns a function that unregisters all four.

## What the card does

- Opens on **Code**, highlighted through whatever highlighter core was given.
- **Preview** — for `html`, `react`, `svg`, `js` and `css` — is mounted only when the reader
  presses the tab: a previewable artifact is model-authored code, and mounting it unasked
  executes it. The frame is `sandbox="allow-scripts"` with a CSP that lets nothing out.
- **Copy** and **Download** on every text artifact; a binary one (`pdf`, `xlsx`, `docx`)
  downloads only once your `onBinary` produced it — without one there is no button, because
  the library holds no bytes.
- Only a call that ran shows the card. One waiting for a person's approval says so; one that was
  refused, stopped or failed shows its title and "Not created", with nothing to copy or download.

## Two ways in, one card

A model with tools calls `create_artifact` with `{ mimeType, title, content }`; the handler
returns the document as the tool's structured result and the card is drawn from it. A model
without tools writes `<artifact type="text/html" title="…">…</artifact>` in its reply; core's
parser — taught the grammar by this plugin through `registerStreamBlock` — streams it into an
`artifact` segment the same card renders.

MIME types follow the standard, plus Anthropic's `application/vnd.ant.*` namespace for
framework kinds (`application/vnd.ant.react`). `deriveArtifactKind(mimeType)` gives the short
kind the card switches on.

## Documents and versions

Each document has an id, which the plugin gives it: `create_artifact` returns it in its result
(`doc_4f2a91c0`), and a tagged document reads back to the model as
`<artifact id="doc_4f2a91c0" …>`. To change a document the model passes the id back, as `id`
to the tool or `id=` on the tag, with the complete new content. That is a new **version** of
the same document: nothing is overwritten.

`artifactDocuments(messages)` reads them from a conversation, a pure function also exported
for Node:

```ts
import type { AparteChatViewport } from '@aparte/core';
import { artifactDocuments } from '@aparte/plugin-artifacts';

declare const viewport: AparteChatViewport; // your <aparte-chat-viewport>

for (const doc of artifactDocuments(viewport.getMessages())) {
  console.info(doc.id, doc.title, doc.versions.length, doc.latest.content);
}
```

It returns `ArtifactDocument[]`, each with its `ArtifactVersion`s, oldest first. A call that
was refused, stopped or failed is not a version. `ArtifactDocumentsOptions` takes `tools` (the
names of this plugin's tools if you renamed them; `ARTIFACT_TOOL_NAMES` by default) and `read`,
which returns an `ArtifactRead` for a segment the plugin does not know, an agent's own
document tool for instance.

## The document panel

`@aparte/plugin-artifacts/panel` is a separate entry: `<aparte-artifact-panel>`, the document
beside the chat with its versions, and `connectArtifactPanel`, which wires a card's Open
button to it.

```html
<aparte-split position="40" single>
  <aparte-chat id="chat">…</aparte-chat>
  <aparte-artifact-panel for="chat"></aparte-artifact-panel>
</aparte-split>
```

```ts
import { setupArtifacts } from '@aparte/plugin-artifacts';
import { connectArtifactPanel, type AparteArtifactPanel, type ArtifactPanelSplit } from '@aparte/plugin-artifacts/panel';

setupArtifacts();
// Open shows the document and opens the pane; Close folds it.
connectArtifactPanel({
  chat: document.querySelector<HTMLElement>('aparte-chat')!,
  panel: document.querySelector<AparteArtifactPanel>('aparte-artifact-panel')!,
  split: document.querySelector<ArtifactPanelSplit>('aparte-split')!,
});
```

The panel reads the conversation and keeps nothing of its own. It takes your own documents
(`documents`), your own rendering of one kind (`render`), your own buttons (a child with
`slot="actions"`), and it works without a split (`onOpen`, `onClose`). The whole of it is on
[its page](https://apartejs.dev/components/artifact-panel/).
