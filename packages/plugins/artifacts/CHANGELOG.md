# @aparte/plugin-artifacts

## 1.0.0

### Patch Changes

- 2e5c5ab: The READMEs of the plugins and the framework packages now show a picture of what they draw. No code changes: nothing to do on your side.

  Each plugin README that draws something (Markdown, maths, diagrams, both chart libraries, the approval modes, the question panel, artifacts, the model selector, code highlighting, compaction) shows its own demo, taken from the live docs (`https://apartejs.dev/shots/<name>.png`). The four framework packages show an assistant reply with a card, a formula and a chart.

- e97d464: Markdown a model writes can no longer carry the attributes core reads as controls, and `<input>` in a reply is limited to a disabled checkbox. Your code needs a change only if a custom segment renderer, a tool `details` string or a custom sanitizer's output relied on those attributes (below), or if a reply was meant to carry a text field or a `role` such as `textbox`.

  What now does nothing, and where it can touch your code:

  - A control carrying `data-aparte-dialog-open`, `data-aparte-dialog-close`, `data-aparte-sidebar-toggle`, `data-aparte-split-pane` or `data-aparte-launcher-close` is ignored when it sits inside a message's content: a custom segment renderer, a tool renderer, a reply. Controls your page places (a header button, a dialog's own Close) work as before. The `@aparte/core` component pages for the dialog, sidebar, split and launcher say so.
  - A tool display's `details` string goes through the sanitizer, so `data-action`, `data-segment-id`, the reserved attributes below and a widget `role` are stripped from it.
  - A card outside any chat on a page with two or more composers no longer sends: it warns instead of picking one. With exactly one composer, or inside a chat, it sends as before.
  - `@aparte/core` — the built-in sanitizer drops these attributes from provider output: every `data-aparte-dialog-*`, `data-aparte-sidebar-*` and `data-checkpoint-*`, plus `data-aparte-chat`, `-host`, `-theme`, `-suggestions`, `-split-pane`, `-launcher-close`, `-bubble`, `-empty`, `-panel`, `-panel-host`, `-card-part`, `data-segment-id` and `data-action`. Other `data-*` attributes (`data-line`, `data-aparte-open` for a formula still streaming, `data-aparte-highlighted`) are kept. A sanitizer you register yourself replaces this list, which is why the listeners above check where the click started as well.

  Before, a reply could carry `<span data-aparte-dialog-open="delete-account">` and open your `<dialog>` on a click, toggle any sidebar by id, switch a split's pane, close the launcher or a dialog the chat sits in, press a compaction checkpoint's Restore without its confirm step, or wrap a card in `<div data-aparte-chat>` to restyle it or redirect its button to another chat. A test reads core's source (hyphenated names and `dataset` reads) so a new attribute cannot be forgotten.

  - `@aparte/core` — a widget `role` (`textbox`, `button`, `link`, `checkbox`, `switch`, `tab`, `tablist`, `menu`, `menuitem`, `dialog`, `combobox`, `listbox`, `grid`, `slider`, `toolbar`, `progressbar`, `tabpanel`…) is dropped from model markup, alone or in a list; every other role stays (`region`, `group`, `status`, `alert`, `math`, `meter`, `term`, `doc-*`, `note`, `figure`, `list`, `table`, `heading`…), since those describe structure and do nothing. `<a role="textbox">` used to take the launcher's focus on open, ahead of the composer; the launcher now ignores text in a reply when it looks for the composer.
  - `@aparte/core` — `<input>` is dropped unless it is `type="checkbox"` (a GFM task list); a kept checkbox is rewritten to `type="checkbox"` and `disabled`, so a padded `type="checkbox "` cannot render as a text box. `<input type="password" title="API key">` used to leave an editable box in the reply. Without a DOM parser (Node, SSR, a Worker) the sanitizer reads each tag the way a browser's tokenizer does and applies the same attribute rule as in a browser, so a server render drops the same attributes (the reserved `data-*`, widget roles, `aparte-` classes, layout styles, ids) and keeps the same task-list checkbox, rebuilt as `<input type="checkbox" disabled>` (checked or not, with its `class`), where a browser would; an attribute value is judged after its numeric entities are decoded and written back escaped. Comments and other `<!` / `<?` declarations are dropped, as in a browser, and a tag left open at the end of the text is dropped.
  - `@aparte/core` — a button inside a checkpoint's summary panel no longer restores. `resolveConfig` skips a `[data-aparte-host]` element that no `attachConfig` bound, so content inside one keeps the chat's own config instead of the page's. The sidebar and split no longer stamp `aria-expanded` / `aria-pressed` on such text.
  - `@aparte/plugin-cards` — a card's `send` button looks for its composer from above the bubble, so a `<div data-aparte-chat>` in the reply cannot redirect it to another chat.
  - `@aparte/plugin-katex`, `@aparte/plugin-artifacts` — the formula pacing key is the segment row (`.aparte-segments > [data-segment-id]`), and the binary-file card honours `data-action="download"` only on its own button, not in a converter's `previewHtml`.
  - `@aparte/core` — without a DOM parser (Node, SSR, a Worker) the sanitizer is a single linear pass: a stray `<` comes out as `&lt;`, so text left beside a dropped tag can no longer spell a new one (`<<x>script>`); a quote inside an attribute value is written as `&#39;`; a comment ends where a browser ends it; and a dangerous element (`script`, `svg`, `form`, `iframe`…) takes everything up to its end tag, or the rest of the text when it is never closed, as it does in a browser. Long hostile input no longer costs quadratic time.
  - `@aparte/core` — a `srcset` made of a very long run of letters (100 000 characters) no longer stalls the page for seconds, in a browser or without a DOM; the scheme check now starts only at the beginning of a candidate, so its cost grows in proportion to the length.

- Updated dependencies [26ddd6c]
- Updated dependencies [e97d464]
- Updated dependencies [0a6dd91]
- Updated dependencies [635f69b]
- Updated dependencies [224afde]
- Updated dependencies [2e5c5ab]
- Updated dependencies [67efebe]
- Updated dependencies [99fcc42]
- Updated dependencies [e97d464]
- Updated dependencies [048864d]
- Updated dependencies [99784ad]
  - @aparte/core@1.0.0

## 0.32.1

### Patch Changes

- 79bc1d4: Right-to-left fixes: the send arrow points left, a framework chat's transcript follows a right-to-left locale, and an approval's arguments read left to right.

  Found by a second right-to-left audit in a real browser (Chromium and WebKit):

  - The send button's arrow points to the left in a right-to-left composer. The stop square and the submit check are not turned. The button says which act it shows (`data-act="send"`, `"submit"` or `"stop"`), and only the send glyph is mirrored, whichever icon `getIcon('send')` returns.
  - With `locale.direction: 'rtl'` on a left-to-right page, a React, Vue, Svelte or Angular chat turned its composer and left its messages left to right. The transcript now turns too.
  - The approval panel's arguments JSON read right to left (`}` on the first line) once the composer showed the panel. It reads left to right, like all code.
  - The model's words in a question or approval panel (the question, titles, descriptions, options, step labels) and a citation's title, domain and snippet read in their own direction (`dir="auto"`), as a message does: an English question in an Arabic page read "?Which colour".
  - The citation card takes the transcript's direction, and its previous and next arrows point outward.
  - The context gauge's panel no longer runs off the left edge of a right-to-left page.
  - A `top` or `bottom` tooltip (the `aparte-tooltip` recipe) is centred on its anchor in a right-to-left page; it sat wholly to the side.
  - The arrow keys of the question panel's step tabs and of the artifact card's tabs move to the next tab in the reading direction.
  - The skeleton's sweep enters at the start edge, as the shimmer's does.

## 0.32.0

## 0.31.0

## 0.30.1

### Patch Changes

- 9861514: An artifact's preview stays open when its card is drawn again; it used to close and show the code.

  A framework redraws a message's segments when its conversation is saved: in the React example,
  the next message replaced the artifact card and the new one opened on Code, the preview the
  person had just asked for gone. The card now remembers the tab chosen, per chat, for that very
  document (its id and its content), and opens on it again. Only what a gesture already ran: a
  reload, another document under the same id, a card still streaming or another chat open on
  Code, as before.

## 0.30.0

## 0.29.4

## 0.29.3

## 0.29.2

## 0.29.1

## 0.29.0

## 0.28.3

## 0.28.2

### Patch Changes

- 2d108c1: The npm page of each of these packages now links to its docs page; nine of them pointed at `/plugins/…` addresses that only redirect since the docs moved, and `docs-mcp` pointed at the site's home.

## 0.28.1

## 0.28.0

## 0.27.4

## 0.27.3

## 0.27.2

## 0.27.1

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
