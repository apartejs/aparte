# @aparte/plugin-artifacts

## 0.16.2

## 0.16.1

## 0.16.0

### Minor Changes

- 3c2e507: `buildSafePreviewDocument`, `PREVIEW_CSP`, `ASK_USER_DECLINED` and `receiptRows` now import on the server too — they used to throw a SyntaxError under Node.

  All four are pure: string work over `escapeHtml`/`escapeAttr` and over a tool call's own input, with no DOM anywhere in their path. They were simply absent from the packages' `node` barrels, and the consequence was not a missing feature but a hard `SyntaxError: The requested module does not provide an export named …` the moment an SSR build evaluated the import — the exact failure those barrels were written to end. `buildReceipt` stays browser-only: it returns an element. `receiptRows` is the data half, and it is the one a server rendering a transcript wants.

  `ReceiptRow` and `ReceiptSource` are exported as types on both entries. `receiptRows` returned an interface no consumer could name.

  `ArtifactsSetupOptions` is now declared once. Each barrel declared its own, and they were not the same shape: the node copy omitted the render half, so `preview` and `onBinary` were a type error against the SSR entry and valid against the browser one. One name meant two contracts depending on which condition resolved. The server still ignores those two fields — it registers no renderer — which is the point: the same options object can be written once and passed on both sides.

- 37f2450: New package: `setupArtifacts()` registers a real `create_artifact` tool the model calls, the Code/Preview card that renders its result, the `<artifact …>…</artifact>` grammar for a model that writes one in its prose, and the segment renderer for it — one implementation, four registrations.

  An artifact is a convention an app teaches its model, not something a model does by nature, so the convention lives in a plugin end to end. The card is the one core used to ship: it opens on Code, mounts the sandboxed preview only on a press (a previewable artifact is model-authored code), copies and downloads a text artifact, and for a binary one (`pdf`, `xlsx`, `docx`) asks the app's `onBinary(artifact)` for the bytes once the source settles — no window-event protocol, no host handlers, no cache the app has to feed: a function that returns `{ buffer, mime, filename, previewHtml? }` or throws, and the card shows the file or the failure. `preview: false` removes the tab; a function replaces the built-in document builder; `tag` renames or (`false`) disables the grammar; `name` and `systemPrompt` are the tool's. `deriveArtifactKind` moves here and learns the standard names of the three binary kinds. The DOM-free `node` entry registers the tool and the grammar without a renderer.

### Patch Changes

- 4123389: An app-built artifact segment with an upper-case `artifactType` (`'HTML'`, `'SVG'`) gets a working Preview tab.

  The card lower-cases `artifactType` at every read, so a segment an app assembles by hand meets the lower-case names the parser produces. Compared case-sensitively it would not: `'HTML'` misses the previewable kinds after the tab has already rendered enabled, and the press shows nothing.
