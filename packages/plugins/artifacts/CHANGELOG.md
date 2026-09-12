# @aparte/plugin-artifacts

## 0.17.0

### Patch Changes

- 4a73996: A CSS artifact can no longer close its own `<style>` and run a script, the binary preview is sanitised by the config of the chat it is mounted in, and a card's tab ids are unique per card. Nothing to change in your code.

  **The `css` preview only styles.** `<style>` is raw text to the HTML parser exactly like `<script>` — it ends on `</style` followed by whitespace, `/`, `>` or end-of-input, whatever the CSS tokenizer thinks — and the `css` kind interpolated the model's body into it unescaped while the sibling `js` kind ran its body through `escapeClosingScriptTag`. So a stylesheet artifact could break out of its wrapper and open a `<script>`, on the one previewable kind whose whole promise is that it only styles. The containment always held (opaque origin, no `allow-same-origin`, and `PREVIEW_CSP` applied both as the `csp` attribute and as a `<meta http-equiv>`), so this was the gap between what "preview this stylesheet" promises and what it does. A closing-`</style>` escaper now mirrors the script one.

  **The binary preview reads the element's config.** `previewMarkup` resolved the _ambient_ config, which from the promise callback that swaps the preview in is the global one long after the render — so a chat with its own `AparteConfig` that registered DOMPurify through `setHtmlSanitizer` had that policy silently skipped at the one sink that puts app-supplied HTML on the page, and its locale skipped at the sentence beside it. Both callers already held the right config; it is passed in now. It failed safe before (the global default is core's own allowlist), which is why nothing showed it.

  **A card's tab ids come from a counter, not from the model.** They were built from `segment.id`, and for a tool-call segment that is `tool-${toolCallId}` — the id the model chose. Two calls answering to the same id put two cards on the page wearing the same `id` and the same `aria-controls`, so `getElementById` returned whichever parsed first: exactly the collision the scoping was introduced to prevent, and the DOM-clobbering shape core's sanitizer already refuses on model markup.

- 913969b: The empty-preview line is readable on the artifact card's paper in the dark theme, the error panel's dark wash now also reaches a system-dark reader who sets no attribute, and the error heading takes the error ink again. Nothing to change on your side. New knob if you re-skin the paper: `--aparte-art-paper-text-muted`, declared beside `--aparte-art-paper-bg` / `-text` and mixed from them.

  The preview pane forces the light paper on purpose — an artifact preview is a DOCUMENT shown inside the chat, the way a PDF viewer shows a white page in a dark editor — and the empty-state line inside it reached back into the theme for `--aparte-text-muted`. In the dark theme that is `#a89bb6`, on `#fff`: **2.62:1**, under 4.5 and under 3. It takes the paper's own muted ink now, so a consumer who re-declares the paper moves it too. (`.aparte-art-file__error-hint` was checked and is not the same case: it sits on `--aparte-error-bg`, where the same colour measures 6.14:1.)

  The sheet's one dark rule was `[data-aparte-theme="dark"] .aparte-segment-artifact-file` with no `prefers-color-scheme` sibling, so a system-dark reader with no attribute kept the LIGHT wash (`rgba(0,0,0,0.04)`) on the already-dark `--aparte-error-bg`. It is duplicated now, the way core's `theme.css` duplicates its dark block for the same reason. And `.aparte-art-file__error-title` was still reading `--aparte-error-title`, a token core removed with the error renderer's private classes: invalid at computed-value time, so the heading quietly took the panel's body ink. It reads `--aparte-error-text`.

  Why all three survived: this is the only plugin stylesheet in the repo and it is read by no guard. `check:derived-vars` reads `coreStylesheets()`, which is the import block of `packages/core/src/index.ts`, so the prefix rule, the single-owner rule, the dead-keyframe rule and "a documented `@cssprop` has a reader" all stop at core's edge. A unit suite reading this sheet stands in for now; widening the guard's corpus is a change to the guard, not to its input — its "a token is read only under its declarer" rule reports 18 false positives here, because the tokens are declared on `.aparte-segment-artifact-*` and read on descendants named `.aparte-art-*`, a relationship its BEM heuristic cannot see.

## 0.16.11

### Patch Changes

- 21dd3bc: The four plugins that ship a custom element now carry the `web-components` npm keyword; nothing changes in the code you import.

  Each already pointed `customElements` at its manifest, which is what the webcomponents.org catalogue reads, but only core carried the keyword the catalogue and npm search filter on. The five plugins that expose no element (compaction, marked, shiki, streaming-markdown, titler) are untouched: they have nothing to list there.

## 0.16.10

## 0.16.9

## 0.16.8

### Patch Changes

- 54ab107: The type ramp rises in the order of its names: `--aparte-font-size-lg` is 1.0625rem (above the body's `base`, it was 0.875rem — below it), and `--aparte-font-size-xl` (1.25rem) and `--aparte-font-size-2xl` (1.5rem) exist. Every reader of the old `lg` moved to the step it meant: the text a person types is the body size, a sender name sits one step under the prose, a card title is above its body, an elicitation question is larger than its options, a dialog title takes the new `lg`, the large field and the large buttons speak at the body size.

  Measured: a welcome title and a placeholder at the same size, a card's title smaller than its body, a full-screen dialog's title at 14px, and the typed text the smallest in the chat. A scale whose name lies is worse than a short one. The artifact card's labels that read `lg` for "a notch above the control text" now read `base` or `md`, so they keep their size.

## 0.16.7

### Patch Changes

- 9df0877: Every package names its documentation page (`homepage`) — nothing in the code changes.

  npm shows the link first on each package page; none of the twenty had one. Each now
  points at its own docs page, verified live before it was written.

## 0.16.6

## 0.16.5

## 0.16.4

## 0.16.3

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
