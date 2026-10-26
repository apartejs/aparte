# @aparte/plugin-artifacts

## 0.27.0

## 0.26.0

## 0.25.0

## 0.24.0

## 0.23.0

### Patch Changes

- 494cd79: A refused, stopped or failed `create_artifact` shows "Not created" instead of a card with Download; one awaiting approval shows that it is waiting.

  The card drew from the model's input whatever the call became, so the person was handed the result of an action they had just refused. A call that ran shows the card; a pending call keeps it (the handler answers at once); one waiting for a decision shows a quiet block; one that never ran shows its badge, its title and "Not created" (`artifactNotCreated`), with no buttons.

## 0.22.0

## 0.21.0

## 0.20.0

### Minor Changes

- 9a0a1d1: New `setupArtifacts({ open: true })` puts an Open button on the artifact card, which dispatches `aparte-artifact-open` with `{ artifact }` so the app can show it in a pane, a dialog or a tab of its own.

  Off by default: the card cannot know where the app's pane is, and a button nothing answers would be a promise the library cannot keep. The event bubbles out of shadow roots and is typed (`ArtifactOpenEventDetail`) wherever the plugin is imported. Its label is the new locale key `openArtifact` ("Open", "Ouvrir").

### Patch Changes

- 30118ab: An artifact card drawn from a tool result keeps its syntax colouring: an update that does not change the code no longer rewrites the pane as plain text.

  A card built from `create_artifact`'s result is settled from its first paint and still receives every update its tool segment gets. Each one set the pane's `textContent`, which wiped the token spans the setup had painted, and with no stream ending there was no second highlight — a plain block in a Shiki frame. The pane is now written only when its content changes, and coloured again when it does.

- 5d6a6ae: Copy on an artifact card now copies the artifact as the card shows it; a streamed artifact used to copy an empty string.

  The card is set up before a streamed `<artifact>` sends its first chunk and is then filled by its updates. Download, Open and the preview read the latest content, but Copy read the content the card was set up with — empty, or the first chunk. The same held for a card from a tool call set up before its result arrived.

- ff458c1: Importing `@aparte/core` (or the approval, artifacts, ask-user or model-selector plugin) from a Cloudflare Worker, a Vercel edge route or a Web Worker that webpack compiles with `target: 'webworker'` now resolves the DOM-free entry instead of the browser one, which failed at import on its first `extends HTMLElement`.

  The DOM-free entry was reachable through the `node` condition only, and those bundlers resolve `workerd`, `edge-light` or `worker` alongside `browser` and `import`. The exports maps now list `worker`, `workerd`, `edge-light`, `deno` and `bun` next to `node`, pointing at the same entry; a browser still gets the elements. A worker started inside a page build is not covered — `new Worker(new URL('./w.js', import.meta.url))` under Vite, or under webpack with its default `target: 'web'`: both resolve it with the browser's conditions, so it gets the browser entry. For core, import the new `@aparte/core/headless` there; the plugins have no such subpath, and how to run a provider or a plugin's tool in that worker is on the [Elements page](https://apartejs.dev/frameworks/elements/#on-the-server). `check:node-import` walks each published map with the conditions of webpack's worker target, wrangler and a Vercel edge route.

- 09ffa64: A segment type of your own now joins `AparteSegment` by declaration merging, so `addSegment`, `appendMessage` and `AparteMessage.segments` take it without `as unknown as AparteSegment`: add it to the new `AparteSegmentTypes` interface, one key per `type`.

  ```ts
  declare module "@aparte/core" {
    interface AparteSegmentTypes {
      chart: ChartSegment;
    }
  }
  ```

  `AparteSegment` was the closed union of core's built-ins, and the segments guide showed the cast. `@aparte/plugin-artifacts` registers its `artifact` segment the same way, so `artifactSegment(…)` is an `AparteSegment` wherever the plugin is imported.

## 0.19.3

## 0.19.2

## 0.19.1

## 0.19.0

## 0.18.0

## 0.17.3

## 0.17.2

## 0.17.1

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
