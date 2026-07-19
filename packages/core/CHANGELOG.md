# @aparte/core

## 1.0.0

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
