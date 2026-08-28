# @aparte/plugin-artifacts

Artifacts for [aparté](https://github.com/apartejs/aparte): a document the model produces — a page, a
component, a script, an SVG, a Markdown note, a spreadsheet — shown as a Code/Preview card in the
transcript. An artifact is a convention an app teaches its model, not something a model does by
nature, so the whole convention lives here: the `create_artifact` **tool** the model calls, the
**card** that renders its result, and the `<artifact>` **tag grammar** for a model that writes one
in its prose.

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

## Two ways in, one card

A model with tools calls `create_artifact` with `{ mimeType, title, content }`; the handler
returns the document as the tool's structured result and the card is drawn from it. A model
without tools writes `<artifact type="text/html" title="…">…</artifact>` in its reply; core's
parser — taught the grammar by this plugin through `registerStreamBlock` — streams it into an
`artifact` segment the same card renders.

MIME types follow the standard, plus Anthropic's `application/vnd.ant.*` namespace for
framework kinds (`application/vnd.ant.react`). `deriveArtifactKind(mimeType)` gives the short
kind the card switches on.
