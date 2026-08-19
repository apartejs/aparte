# @aparte/core

## 0.4.0-alpha.0

### Minor Changes

- 50d90a8: **The waiting state now exists.** Between "user sends" and the first token there was a bubble
  with a name and an empty body — and, in the display-only path, copy/retry on a reply that
  hadn't happened. The bubble now shows a built-in indicator while it is in flight with nothing
  in it: animated dots (CSS, so no per-token work, themable via `--aparte-waiting-*`, and
  already covered by the reduced-motion rule) plus a screen-reader label taken from
  `locale.typing` — a string that shipped in `DEFAULT_LOCALE` and was read by nothing until now.

  No wiring: it works in raw `<aparte-chat>`, in the four wrappers, and in a hand-rolled loop.
  `<aparte-chat-status>` / `isTyping` stay **your** channel for your own status ("indexing your
  files"), which is why they are not auto-driven.

  New export **`isAwaitingReply(message)`** — the one rule core and all four wrappers now share
  for "is this bubble in flight". Besides `status: 'streaming' | 'pending'`, it also covers an
  **assistant message with no `status` at all and nothing in it**: the empty shell a token stream
  is about to fill. That case used to render as a finished reply, action bar included. Only
  silence is interpreted — an explicit status, `'completed'` on an empty message included, is
  believed.

  If you deliberately append empty assistant bubbles that no stream will fill, give them an
  explicit `status` (e.g. `'completed'`) or they will show the indicator.

- cda5f54: `<aparte-chat>` gained an **`attachments`** attribute: it adds the file picker
  (`<aparte-composer-add-attachment>`) and the chips strip (`<aparte-composer-attachments>`)
  to the default composition, in their canonical positions. It is reactive — toggling it
  after mount inserts or removes the two primitives, and removing it also drops any file
  already staged in the composer (keeping them would send files with nothing in the UI
  showing them).

  Nothing changes without the attribute: the default composition is still
  `viewport + composer(input · send)`. Attachments are **opt-in** because the capability
  needs a host that consumes the files — an `AparteClient` inlines them per its
  `rawFileInject` option, but a hand-rolled loop has to read `event.detail.files` or the
  user's file is dropped in silence. Composing your own composer? Keep dropping the two
  primitives in wherever you want them, as before.

- e9909c6: New exported helper `filesToAttachments(files)`: turns the `File[]` an
  `aparte-send` event carries into the `AparteAttachment[]` a bubble renders (id,
  MIME type, object URL, and the raw `File` kept for storage adapters).

  This conversion already existed inside `ConversationController`, so framework
  wrappers had it — but a raw-core consumer driving `appendMessage()` itself had to
  hand-roll object URLs, and silently rendered attachment-less bubbles if it
  didn't (the vanilla playground did exactly that). The controller now uses the
  same helper, so there is one implementation.

### Patch Changes

- 358bc53: `appendToSegment` no longer costs a full framework render per token. It used to
  rebuild the message list and call `setMessages` + `onMessagesChange` on every
  chunk — while the plain-text path (`appendToken` / `injectTokenStream`) wrote
  straight into the bubble. Streaming a thinking block or a tool pill from a fast
  local model was therefore unusable, and nothing in the imperative API hinted that
  the two methods differed so much.

  Chunks now go straight to the bubble as before-and-immediately, and the framework
  state is synced **once per frame** (`requestAnimationFrame`, falling back to a
  macrotask where it doesn't exist). Any structural change — a new segment, a new
  message, a conversation swap — flushes the buffer first, so ordering is never
  observable. Consumers that wrote their own rAF batcher around this can drop it.

  The JSDoc and the "Bring your own loop" guide also state what was undocumented:
  segments and `content` are mutually exclusive at render time.

- 801622a: Swapping a branch no longer conjures a scroll-to-bottom button on a transcript you are
  already at the bottom of, and no longer drops you away from the bottom while the new version
  renders.

  Two things were wrong. `navigateBranch` turned auto-follow **off** unconditionally so a
  rebuild wouldn't yank a reader who had scrolled up — but doing that to a reader who was at
  the bottom left them behind (a rebuild's height flickers: measured at 1730 → 1934 → 1730px
  on the React wrapper as the swapped-in bubble renders and settles) and, since the button
  mirrored that flag, offered them a scroll to nowhere. It now keeps auto-follow when you were
  at the bottom, and only disables it when you weren't.

  And the button stopped mirroring the flag at all: it asks the geometry ("is anything below
  the fold?") on every scroll and on every post-mutation frame. The flag is intent, the button
  is a fact; mirroring one with the other made it lie whenever they diverged. This was most
  visible in the four wrappers, where the post-swap re-derive never ran (the framework owns the
  DOM, so that code path returned early), but the flag could go stale in raw core too.

- 0d4945f: Two attachment-rendering fixes in the message bubble:

  - **Alignment**: a user message's attachment strip was anchored to the trailing
    edge while the user bubble hugs its text on the leading edge — one message
    split across both sides of the transcript (a chip on the right, the text
    bubble on the left). The strip now shares the bubble's edge.
  - **Standalone `appendMessage()`**: the viewport created the bubble from
    attributes only, silently dropping the message's `attachments`, `segments`
    and `usage`. It now runs the same `populateBubbleFromMessage` sync the
    framework-managed path uses, so an imperatively appended message renders in
    full (bring-your-own-loop consumers were getting text-only bubbles).

- de57a6a: Fix a pending assistant bubble showing its action bar (copy/retry) and no busy
  state in every framework wrapper. A wrapper creates `<aparte-chat-bubble>` with
  its attributes already set, so `streaming` arrived _before_ the element rendered
  its inner DOM — and `_updateStreaming()` had no `.aparte-message` to write to, so
  `data-streaming`, `aria-busy="true"` and the class that hides the footer were
  silently dropped for the whole turn. The state is now re-applied when the inner
  DOM is built.

  Visible effect: an empty, still-streaming reply no longer offers Copy/Retry, and
  screen readers get `aria-busy` while the answer is being generated.

- af5ed3d: `@aparte/core` now declares `sideEffects` (it was the only one of the 14 packages
  without it, so bundlers had to treat every module as side-effectful and could not
  tree-shake it). The browser entry and the CSS are listed as effectful — they define
  the custom elements — and everything else, including the DOM-free Node entry, is
  pure.

  The README gains a **Node / SSR** section: the `node` export condition, what the
  server entry keeps (client, host, transports, `createAparteChatHandler`, runtime,
  types) and what it drops (the custom elements, with `registerAllComponents()` a safe
  no-op). The capability already existed and was invisible — reading `src/index.ts`
  shows the _browser_ entry, which is how a consumer concludes the opposite.

- 2336bc5: A partial `AparteIconProvider` no longer breaks the bubble action bar. `getIcon()`
  always fell back to the built-in SVGs for icons a provider didn't implement, but
  `getIconProvider()` — what the action bar reads, calling each icon directly —
  handed back the registered provider verbatim, so a provider covering only some
  icons threw `icons.retry is not a function`. It now returns a complete set,
  falling back per icon.

  Consequently every key on `AparteIconProvider` is now optional, which is what the
  runtime always supported (and what the interface's own example showed). Full
  providers keep type-checking unchanged; partial ones stop needing `as any`.

- 79b2795: Accessibility fixes in `<aparte-select>` (and therefore the model selector), all
  found by axe-core scanning an _open_ dropdown:

  - the `listbox` role moved from the dropdown shell to the options container, so
    the search field is no longer an invalid child of a listbox (critical);
  - the `combobox` trigger now declares the `aria-controls` it is required to have,
    and the listbox carries its own accessible name (critical / serious);
  - `<aparte-optgroup>` names itself with `aria-labelledby` instead of putting
    `aria-label` on its header div, which had turned a generic node into an invalid
    listbox child (critical);
  - the selected option no longer paints white text on the brass accent (≈3.4:1 in
    light, worse in dark). It now uses an accent _tint_ plus an inset accent bar and
    keeps the theme's text colour. `--aparte-select-option-selected` and
    `--aparte-select-option-selected-text` still override both.

  Known remaining gap: collapsing a provider group is pointer-only (the group
  header is not focusable).

- 9f839e4: Fix send routing when several chats share a page. `AparteClient._handleSend`
  resolved the event's `targetId` by requiring `appendMessage` **on** that element,
  but an `<aparte-chat>` shell owns no `appendMessage` — it delegates to its
  `.viewport`. Every `target`-attributed send therefore logged a warning and fell
  through to a DOM scan that returns the _first_ chat on the page, so with two
  chats mounted one chat's reply rendered inside the other. Send now uses the same
  resolver as retry/edit (which had already been fixed for this).
- 80995ea: `injectTokenStream` / `streamTokens` now keep the framework's message list in sync. They
  pushed every token to the viewport and told the framework **nothing**: the DOM held the
  reply while React/Vue/Svelte state still had `content: ''`. Anything re-rendering from state
  wiped the visible answer, `getMessages()` lied, persistence saved an empty message — and a
  custom bubble (`renderBubble`, driven by that state) showed nothing at all.

  Same discipline as `appendToSegment`: each token reaches the bubble immediately, the state is
  synced **once per frame**, and a flush is guaranteed before completion, on abort, and before
  any structural change. Both stream channels now fold into a single list update, so a frame
  carrying tokens _and_ segment chunks still costs one render. A stopped stream keeps what was
  already streamed (truncated, not erased), and the sync targets the stream's own message id
  rather than "the last message".

- 118d4fb: Editing a message now updates the bubble that shows it. `AparteChatViewport`
  forwarded an atomic `updateMessage()` to the rendered bubble only when the
  payload carried `status` or `segments`, so an edit — which sends `{ content }` —
  updated the message repo (and therefore the history sent to the model) while the
  transcript kept displaying the old wording. `content`, `attachments` and `usage`
  updates are forwarded too now.

  Standalone/raw-core consumers were affected; framework wrappers re-render bubbles
  from their own state, which masked it.

## 0.3.0-alpha.0

### Minor Changes

- d4c448b: New `fileInjectFilter` on `AparteClientOptions`: a per-file veto on top of the
  `rawFileInject` mode. Called for each attached file the mode would inline into
  the request; return `false` to keep it out (the file still rides on the
  `aparte-send` event for the application layer). Lets a host keep the default
  inline UX while blocking sensitive names (`.env`, keys, certs).
- 7227dee: New `AparteConfig.resetLocale()`: restores the built-in English locale after a
  `setLocale(...)` call, without having to import `DEFAULT_LOCALE` yourself.
  Notifies mounted components like every other live setter.
- 7227dee: `AparteAIProvider.getModels()` is now typed **synchronous-only** (`AparteAIModel[]`).
  The `Promise<AparteAIModel[]>` form was silently ignored by `getCurrentModel()`: an
  async provider lost its capability list (e.g. `function_calling`), which disabled
  tools with no error or warning. Async model fetching belongs in `fetchModels()`
  (consumed by `AparteConfig.refreshProviderModels()` and the model-selector).
  Plain-JS consumers that still return a Promise now get an explicit `console.warn`
  instead of a silent failure. All bundled providers already complied.

### Patch Changes

- 0192d63: `injectTokenStream` / `stopTokenStream` now carry real JSDoc on the canonical
  `AparteChatImperativeApi` (shipped in the `.d.ts`, so it surfaces in every
  wrapper): the viewport auto-creates a missing assistant message internally
  only, so wrappers should `appendMessage` explicitly before injecting. A new
  "Bring your own loop" docs guide covers the display-only mode end to end.
- 622dc78: `<aparte-select>`'s combobox trigger now carries an accessible name (axe
  `aria-input-field-name`, serious): the host's `aria-label` when provided,
  falling back to the `placeholder`. Screen readers previously announced the
  model selector as an unnamed combobox.

## 0.2.0-alpha.0

### Minor Changes

- 930a108: Harden the server-side `createAparteChatHandler`: add an optional `authorize(req)` gate
  that runs before any work (return `false` for a 401, a `Response` for a custom rejection,
  or `true` to proceed) so you can put auth in front of the key-spending `/api/chat` route,
  and guard the vendor URL build against an adapter returning a non-rooted request path
  (SSRF) by rejecting anything that isn't a single-rooted path.
- 4aac26d: Add the `<aparte-chat>` shell — the container element for a chat. Wrap a viewport
  and a composer in it and it lays them out as a flex column; leave it empty and it
  fills in a default composition:

  ```html
  <!-- default composition -->
  <aparte-chat
    center-empty
    placeholder="Say something…"
    style="height: 600px"
  ></aparte-chat>

  <!-- or your own primitives inside, still laid out + center-empty -->
  <aparte-chat center-empty>
    <aparte-chat-viewport></aparte-chat-viewport>
    <aparte-composer>…</aparte-composer>
  </aparte-chat>
  ```

  Being a component, it owns behaviour a wrapper `<div>` can't: with the opt-in
  `center-empty` attribute it watches its own viewport and keeps the composer
  centered as a welcome state until the first message, then slides to the normal
  layout — no external JavaScript. Presentational only (no transport wiring);
  `placeholder` / `disabled` forward to the composer, and `.viewport` / `.composer`
  getters expose the composed elements.

- a2ed74b: Ship clean inline-SVG default icons (copy, retry, edit, send, thumbs up/down, and
  the rest) in `DEFAULT_ICON_FALLBACKS`, so the chat looks right out of the box with
  no icon plugin — still zero runtime dependencies, since an inline SVG is just a
  string. Override any icon via `setIconProvider` with any HTML (SVG, an icon-font
  `<i>`, an emoji or an `<img>` — the value is treated as trusted markup).
- a6ed936: One canonical imperative contract for `<AparteChat>` across the four wrappers.

  `@aparte/core` now exports `AparteChatImperativeApi` — the ~20-method surface every
  framework handle delegates to `AparteChatHost`. React's `AparteChatHandle` and
  Vue/Svelte's `AparteChatInstance` are now type aliases of it, and the Angular
  component `implements` it, so any per-wrapper drift (a missing or mistyped method)
  is a **compile error** instead of a silent divergence.

  **Angular parity:** adds the imperative `setConversationId(id)` method (the
  `conversationId` `@Input` remains the declarative path), closing the one gap where
  Angular's handle differed from the other three.

- 7157ad5: Unify every custom DOM event to one kebab-case convention and type it.

  The public event surface used three conventions — kebab (`aparte-send`), colon
  (`aparte:retry`, `aparte:action`, `aparte:artifact-*`, …) and separatorless
  (`apartemessagestart`/`done`/`error`/`aborted`). They are now **all kebab-case**:

  - `aparte:*` → `aparte-*` (e.g. `aparte:retry` → `aparte-retry`, `aparte:action`
    → `aparte-action`, `aparte:tool-decision` → `aparte-tool-decision`).
  - `apartemessagestart|done|error|aborted` → `aparte-message-start|done|error|aborted`.
  - Already-kebab events (`aparte-send`, `aparte-select-*`, `aparte-model-change`, …)
    are unchanged.

  Kebab is the only convention every framework can bind in a template — Angular
  parses a `:` in an event name as a `target:event` selector, so colon events could
  never be `(aparte:x)`-bound there.

  **New:** an `HTMLElementEventMap` augmentation ships with `@aparte/core`, so
  `element.addEventListener('aparte-retry', e => e.detail)` gives a typed `e.detail`
  (no more `(e as CustomEvent<…>).detail` cast) for the public bubble / lifecycle /
  artifact / tool events.

  **Breaking:** any consumer listening on the old colon or separatorless names must
  rename to kebab. Pre-1.0, so shipped as minor.

- 69525ad: Zero-dependency web components for AI chat: bubble, composer, viewport,
  conversation list, and elicitation, with a transport seam (`DirectTransport` /
  `BackendTransport`) and a customization surface (render hooks, action registry,
  theming via CSS custom properties). Ships ESM plus a Node/SSR-safe entry and a
  custom-elements manifest.
- d31f681: Give the base chat container layout to both host shapes core already recognises,
  from one rule. Core resolves the chat host via the selector
  `aparte-chat, [data-aparte-chat]` (the vanilla `<aparte-chat>` element and the
  `<div data-aparte-chat>` roots the framework wrappers render); the base
  flex-column layout (fill the parent, viewport scrolls internally, composer pinned
  to the bottom) now keys on that same selector in `aparte.css`. This fixes React,
  whose wrapper container previously had no base layout, and lets the Vue and Svelte
  wrappers drop their scoped component CSS — every wrapper gets consistent layout
  from the one stylesheet consumers already import, with no wrapper-specific class.
- e69435f: Make the `<aparte-chat>` shell framework-safe: it no longer injects its default
  viewport + composer when the element carries `framework-managed`. A framework
  wrapper whose component selector is `aparte-chat` (the Angular one) has its host
  upgraded by core, and its children only render _after_ `connectedCallback` — so
  the existing "author-provided composition wins" check cannot see them, and the
  default composition was being injected underneath the wrapper's own. Reuses the
  same `framework-managed` signal `<aparte-chat-viewport>` already takes.
- bfa9901: Theme every part of the chat from CSS. The message surface is now a
  `.aparte-message-content` region (attachments sit above it as a sibling, the
  avatar is opt-in — empty by default), and every theme value flows through a CSS
  custom property: colour, spacing, font size / weight / line-height, control
  sizes, radii and border widths. No hardcoded theme literals remain — only
  structural geometry (`100%`, `50%` radii, the spinner stroke). New scales:
  `--aparte-space-*`, `--aparte-font-size-*`, `--aparte-font-weight-*`,
  `--aparte-line-height-*`.

  BREAKING: the `--aparte-bubble-*` theme variables are renamed to
  `--aparte-message-content-*`.

- 554e4e9: **Remove the deprecated `<aparte-chat-input>` element** (`AparteChatInput`). It was the legacy
  monolithic composer — 653 lines of `innerHTML`-heavy code that auto-registered on import into
  the zero-dep core, was untested, and predated the modern `<aparte-composer>` + `<aparte-chat>`
  composition. It is no longer exported, registered, or styled; the elicitation panel and the
  client's target resolution already preferred `<aparte-composer>` and simply drop the legacy
  fallback. Reclaims bundle size and removes an untested surface from core.

  **Breaking** (pre-1.0, shipped minor): consumers still on `<aparte-chat-input>` should move to
  `<aparte-chat>` (or `<aparte-composer>` directly). The `AparteInputConfig` type stays.

- f8a6dd7: De-duplicate the wrappers' `AparteUi` prop-applier. The four wrappers each
  carried a byte-identical vanilla-DOM prop applier + event list; they're now in
  `@aparte/core` as `applyElementProps(el, props, transformValue?)` and
  `DEFAULT_UI_EVENTS`. Vue passes `toRaw` as the transform to unwrap its reactive
  proxy. No public wrapper API change.
- d60e2c8: Type the request `_meta` channel. `AparteChatRequest._meta` is now
  `AparteRequestMeta` instead of `Record<string, unknown>`: the five well-known
  keys (`pipeline`, `prefixSegments`, `artifactHint`, `artifactRaw`, `artifactXml`)
  are typed and documented, while an open index signature keeps it a channel for
  consumer-specific context. New exported types: `AparteRequestMeta`,
  `ApartePipelinePhase`, `AparteArtifactHint`.
- e8d9b32: Unify custom action registration into one zoned API.

  A single `registerAction(action)` now places a button via
  `zones: ('composer' | 'bubble')[]`, with per-zone options
  (`composer: { position, hidden }`, `bubble: { roles }`). Every action emits the
  declarative `aparte-action` event (now carrying `zone`), with an optional
  `onClick` callback fired alongside for convenience.

  **Breaking:** `registerBubbleAction`, `getRegisteredBubbleActions` and
  `unregisterBubbleAction` are removed, and the `AparteBubbleAction` type is merged
  into `AparteAction` (use `zones: ['bubble']` + `bubble.roles`). `getActions(zone)`
  now requires a zone argument.

### Patch Changes

- 6ab5682: Round-3 audit follow-ups (bounded fixes):

  - **Cross-wrapper parity is now compile-enforced on all four wrappers** (was only React +
    Angular): Vue's `defineExpose` uses `satisfies AparteChatImperativeApi`, Svelte adds a
    type-checked parity factory. A dropped/mistyped method is now a build error in every
    wrapper — and the `AparteChatImperativeApi` JSDoc no longer overstates the guarantee.
  - **core**: `AparteConfig.unregisterAIProvider` now `_notify()`s (a mounted model-selector
    drops the removed provider instead of showing a stale list); `<aparte-select>` resolves its
    selected label by iterating options instead of an interpolated attribute selector (a model
    id containing `"`/`]` no longer throws `SyntaxError`).
  - **docs/JSDoc hygiene**: removed three shipped references to non-existent
    `@aparte/plugin-{skeleton,icons}-default` packages; fixed the `useAparteChat` `@example` that
    re-appended the user message (double-append); the three AI-provider READMEs now call
    `@aparte/core` a required **peer dependency** (it's a runtime import), not an "optional peer".

- 4065fd6: Bound the binary-artifact preview cache. `_binaryArtifactCache` held full file buffers
  (pdf/xlsx/docx) keyed by segment id and was never evicted, so a long session generating
  many binary artifacts grew memory for the page's lifetime. It's now capped (LRU-ish: cap
  24, oldest evicted on insert, re-insert refreshes recency).
- 307039b: Fix a small memory leak in the segment renderers: two internal per-segment throttle
  maps (syntax-highlight and artifact-dispatch debouncing) grew one entry per streamed
  segment for the page's lifetime. They're now bounded and evict oldest like the
  neighbouring binary-artifact cache, so long-running sessions no longer accumulate them.
- 333d301: Tighten the client's typing: the four near-identical local target interfaces
  (`AparteChatElement`/`RetryTarget`/`EditTarget`/`CompactTarget`) are consolidated into the
  one module-level `AparteChatTargetElement`, which removes ~two dozen gratuitous
  `(target as any).method` casts; the three `catch (err: any)` become `catch (err: unknown)`
  with narrowing; and `(segment as any).content` reads become a typed `{ content?: string }`
  cast. No behaviour change — pure typing rigor (the `as any`s were papering over methods the
  element already declares). Drops the repo's `no-explicit-any` warning count from ~63 to ~39.
- 14f1f1d: Collapse the triplicated send / retry / edit tail into one `_streamTurn` helper.

  `_handleSend`, `_handleRetry` and `_handleEdit` each re-implemented the same
  provider → tools → request-interceptor → `toolChoice:'none'` strip → reset-abort →
  `aparte-message-start` → `_streamLoop` → `aparte-message-done` / lifecycle-error
  sequence. They now share one private method, so that flow can't drift between the
  three entry points. As part of it, `_handleSend` uses the shared `_resolveAuth`
  helper and resets the abort flag before streaming — the two divergences the audit
  flagged (a documented past drift). No behavior change on the happy path (verified:
  867 unit incl. the retry/edit suites + parity, and 27/27 browser E2E).

- 18d2065: Enforce lint at zero warnings (`eslint . --max-warnings 0`) and clear the 37
  `no-explicit-any` backlog — each replaced with a precise type or, where DOM /
  custom-element interop genuinely requires it, a structural `unknown` cast (no blanket
  `any` disables). A few public types are tightened from `any` to a precise type or
  `unknown` (e.g. `AparteCustomSegment.data`, `AparteError` context) — a type-safety
  improvement with no runtime change.
- 6d6123e: Fix an XSS sink: the chat bubble's public `name` attribute was interpolated raw into
  `innerHTML` on initial render, while every sibling field (attachment names, etc.) was
  escaped. An app that binds an untrusted author/persona name into `name` would ship a
  script injection. Escaped it, consistent with the other fields, + a regression test.
- 97bd6c5: Escape three more consumer/stream-supplied fields that reached innerHTML unescaped: the
  composer action `label` and input `placeholder` (attribute positions) and a `message-id`
  CSS attribute-selector in the viewport (now `cssEscape`d like its siblings). Harden the
  bubble / conversation-list / attachment escape helpers to also escape `'`. Add a
  best-effort `.catch` to the fire-and-forget syntax-highlight and clipboard promises so a
  rejecting highlighter or clipboard write degrades silently instead of an unhandled rejection.
- 8417976: Harden the internal `[data-segment-id]` / `[message-id]` attribute-selector lookups in
  the bubble and viewport against a hostile, stream-supplied id: interpolated ids are now
  escaped for the quoted-attribute context (via a small `cssEscape` helper that needs no
  `CSS` global, so it also works in SSR/test runtimes). An id containing `"` (e.g. a
  provider-supplied tool-call id) can no longer throw a `SyntaxError` that drops a render
  update, nor form a selector list that mis-targets another element. Ids are random UUIDs
  by default, so this is defense-in-depth.
- 1f6c43e: Escape the `thinking` segment's `label` before it reaches `innerHTML` (the adjacent
  `content` was already escaped). Built-in callers always pass a hardcoded label, but a
  host rendering a model-derived label into a thinking segment would otherwise have a
  stored-XSS sink — closed defensively, consistent with the other renderer escapes.
- 2efef6f: Extract `_streamLoop`'s ~190-line `tool_use` case into a `_handleToolUseEvent` helper
  (built-in `create_artifact`, per-tool renderer, the human-in-the-loop approval gate, and
  the handler run with its timeout/abort). The loop now delegates and reads the
  continue/stop signal back. Behaviour-preserving — proven by the engine parity golden-master
  that drives the real `_streamLoop`, plus the client tool/HITL suites (869 tests, 27/27 e2e).
- 0aefd9b: Robustness fixes surfaced by the code audit:

  - **core `AparteConfig`** — `_notify` isolates each subscriber in try/catch (one throwing
    listener no longer aborts the loop and starves the others); `setLocale`/`extendLocale`/
    `setAvatarProvider` now notify subscribers like every other live setter, so a runtime
    locale/avatar swap propagates to already-mounted components; `refreshProviderModels` is
    typed `Promise<AparteAIModel[]>` instead of `Promise<any[]>`.
  - **engine** — a tool handler is no longer invoked when the run's `AbortSignal` was already
    aborted before the call (a past `abort` event never re-fires on the fresh listener).
  - **provider-openai-compat** — malformed tool-call arguments JSON at
    `finish_reason: 'tool_calls'` and unparseable SSE data lines now log a breadcrumb instead
    of being dropped silently.

- 0aefd9b: Escape untrusted model output before it reaches `innerHTML` (two DOM-XSS paths):

  - **core** — the code-segment `language` (the ` ```lang ` fence tag, LLM-authored and
    prompt-injectable) is now HTML-escaped in both the label text and the
    `class="language-…"` attribute; the file-tree node `status` too.
  - **core primitives** — `<aparte-select>` and `<aparte-optgroup>` build their labels via
    `textContent`, not `innerHTML`, matching their own update paths.
  - **plugin-model-selector** — remote model names/ids and provider labels are escaped before
    the option list is (re)built.

  Reachable from a hostile/aggregating `/models` endpoint or a prompt-injected code fence.

- 9568c6b: Escape `data-segment-id` in every segment renderer. A segment id can embed an untrusted
  tool-call id (`tool-${toolCallId}`, taken verbatim from the endpoint's SSE `tool_calls[].id`),
  so the tool-call renderer — and, defense-in-depth, all other renderers plus the ask-question
  receipt — now HTML-escape it before it reaches `innerHTML`. Closes a DOM-XSS reachable from a
  hostile OpenAI-compatible endpoint (the same class as the code-fence `language` fix, in a
  sibling sink). Regression test added.
- 7e5cfb7: Teardown + sanitizer hardening from the audit:

  - **core `AparteChatHost.streamTokens`** now races each `next()` against the abort signal and
    calls `iterator.return()` on abort. An idle token source (notably the Angular
    Observable→AsyncIterable adapter parked on a pending `next()`) previously left the loop and the
    underlying subscription alive after `stopTokenStream()`; it now unwinds and cleans up promptly.
    Fixes the zombie-subscription leak for every wrapper. Regression test added.
  - **`@aparte/angular`** `AparteChatComponent` now unsubscribes its `bubbleRefs.changes`
    subscription in `ngOnDestroy` (previously leaked one live subscription per mount across SPA
    route churn).
  - **core sanitizer** drops the legacy `name` attribute from `<a>` — obsolete and a DOM-clobbering
    vector (`id`/`style` kept: they carry legitimate aria/anchor/highlight uses; a property-level
    `style` allowlist is a separate pass).

- 75af64a: Fix two browser-only defects surfaced by the new cross-framework browser E2E
  suite (both passed the jsdom unit tests):

  - **Standalone send, retry and edit now resolve the viewport.** In the
    documented flat layout (`<aparte-chat>` wrapping `<aparte-chat-viewport>`), the
    client matched the shell first and — finding no `appendMessage` on it —
    silently dropped the reply (send) or no-op'd (retry/edit). A shared resolver
    now scans candidates for the one that can actually render, following the
    shell's delegation to its viewport, so a bare-shell chat streams, regenerates
    and edits out of the box.
  - **The model-gate style applies to every host.** The `data-model-gated` opacity
    rule had been mis-scoped (a comment split the selector list), leaving the
    vanilla composer permanently dimmed and greying only a `[data-aparte-chat]`
    direct child when gated. It is now an unscoped `aparte-composer[data-model-gated]`
    rule that dims any gated composer, in every wrapper and the vanilla shell.

- fa5a3f8: Message editing now reuses the composer's contenteditable input instead of a bespoke
  `<textarea>`, so editing a message is iso with composing one:

  - Same input primitive (`<aparte-composer-input>`): autosize, IME handling, paste, placeholder
    and styling are shared. The edit box is styled like the composer shell.
  - **`Enter` saves, `Shift+Enter` inserts a newline** (was `Ctrl/Cmd+Enter`); `Esc` still cancels.
  - The save/cancel icons route through the icon provider (`getIcon('check')` / `getIcon('close')`),
    so `setIconProvider` overrides them too; their colours stay themable via `--aparte-success` /
    `--aparte-error`.

  `<aparte-composer-input>` is now usable standalone: with no `<aparte-composer>` parent it emits a
  bubbling `aparte-composer-submit` event on submit instead of no-op-ing, and gains a `focusEnd()`
  method (focus with the caret at the end of the content). Its contenteditable also handles newlines
  robustly now — `Shift+Enter` inserts a single deletable `<br>` (no `<div>` wrappers), an empty
  field can't start with a blank line, and `getValue()` preserves newlines (`<br>` → `\n`).

  The `aparte-edit` event contract is unchanged.

  Also fixes `<aparte-chat center-empty>`: the empty/welcome state centers again. The viewport's
  standalone `height: 100%` (for the scroll chain) was defeating `flex-grow: 0`, so the composer
  couldn't center; it's released only while empty.

- 8a3890b: Isolate streaming state between multiple chats on one page. Lifecycle events
  (`aparte-message-start` / `done` / `error` / `aborted`) and `aparte-abort` now
  carry the target host's `targetId`, and a composer only reacts to its own host's
  turn. Before this, streaming in one chat flipped every composer to the "Stop"
  state, a `done` in one reset the others (hiding an active elicitation panel), and
  cancelling one aborted every scoped client. Id-less single-instance pages still
  broadcast unchanged.
- 49f4d70: Robustness hardening: bound the file-generation handler map so a generation that never
  terminates (e.g. the conversation is cleared mid-flight) can no longer leak its window
  listeners for the page's lifetime; add a compile-time exhaustiveness guard on the
  stream-event switch so a new event variant fails the typecheck instead of being silently
  ignored; and mark every intentional fire-and-forget promise in the streaming / render
  paths explicitly (type-aware lint now guards against unhandled rejections).
- fcff831: Re-export the `AparteSystemPromptVarsProvider` type from the package root (both
  the browser and Node entries) so consumers can type the argument of the public
  `AparteConfig.setSystemPromptVarsProvider()` without reaching into a deep import.
- 455fc81: Branch + shell fixes:

  - **Message tree:** `MessageRepository._relink` no longer corrupts the old parent's
    active branch when the moved node was that parent's active child (it walked
    `findHead` into the subtree being moved and left a dangling pointer). Only reached
    on re-parenting the active child; retry/edit flows were unaffected.
  - **`<aparte-chat>` shell scroll:** the shell now sets `height: 100%` so the inner
    scroll container has a definite height to resolve against. Inside a flex column with
    no definite ancestor height the container grew with content and nothing scrolled
    (messages/action-bars spilled below the view). Give the shell — or a parent — a
    definite height and it scrolls internally; the styled scrollbar, wheel, auto-scroll
    and scroll button stay wired to the same inner container. The scroll-to-bottom button
    is also re-derived from real geometry after a path re-render (a branch swap rebuilds
    the DOM with no `scroll` event, so it could otherwise stay stale).

- 6a50004: Harden the default sanitizer's residual defense-in-depth gaps:

  - **Inline `style` is now a property allowlist** (colours, weights, decoration — what
    highlighters emit) instead of a scheme blocklist. Layout/positioning properties
    (`position`/`z-index`/`inset`/`width`/…) are dropped, so hostile markup can no longer build
    a full-viewport click-jacking overlay, and `url()` beacons are rejected on any property.
    Safe declarations survive even when a dangerous one sits beside them (previously the whole
    attribute was dropped all-or-nothing).
  - **`id`/`name` are no longer allowlisted** — they enable DOM clobbering and LLM-authored
    markup has no legitimate need for author-controlled ids.
  - The js-artifact preview's `</script>` escaper now matches `</script` followed by any
    spec terminator (whitespace/`/`/`>`), not only the exact `</script>` (still inside the
    sandboxed, `allow-scripts`-without-`allow-same-origin` iframe).

- 9ce7978: Fix a server-side-rendering crash on the framework wrappers. The Node/SSR entry
  (resolved via the `node` export condition) was missing `applyElementProps` and
  `DEFAULT_UI_EVENTS` — two DOM-free interop helpers that every wrapper's `AparteUi`
  imports as **values**. Because each wrapper barrel re-exports `AparteUi`, importing
  anything (even just `AparteChat`) from `@aparte/react` / `@aparte/vue` /
  `@aparte/svelte` / `@aparte/angular` under SSR (Next.js, Nuxt, SvelteKit, Angular
  Universal) crashed the whole barrel with `does not provide an export named
'applyElementProps'`.

  The Node/SSR entry now mirrors the browser barrel's full non-DOM surface — also
  exposing `DirectTransport`, `BackendTransport`, `isFormatAdapter`,
  `parseAparteEventStream`, and the render-hook / transport / tool-resolver types that
  were only on the browser entry — and a new parity test enumerates that surface so the
  two barrels can never silently drift again.

- e96920a: Type `aparte-composer-change` in the `HTMLElementEventMap` augmentation, so
  `el.addEventListener('aparte-composer-change', e => e.detail)` is typed like the other public
  events (it's in `DEFAULT_UI_EVENTS`, so the wrappers already forward it). Closes the gap where
  a forwarded, typed event was missing from the event map.
