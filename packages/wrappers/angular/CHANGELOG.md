# @aparte/angular

## 1.0.0

### Minor Changes

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

- 1573645: One imperative API across the four wrappers:

  - `injectTokenStream` now takes the cross-wrapper `AsyncIterable<string>` contract on Angular
    too (the RxJS `Observable<string>` shape still works — it's a union).
  - Angular `provideAparte()` auto-connects the client on app init (`autoConnect: false` to opt
    out); no more manual `AparteAiService.connect()` in components. `connect()` stays as the
    idempotent escape hatch.
  - The viewport accessor is `getViewport(): HTMLElement | null` everywhere. **Breaking**: it
    replaces React's `handle.viewport` property and Vue's exposed `viewport` ref.
  - The Vue/Svelte `AparteChatInstance` interfaces now include the full imperative surface
    (`scrollToBottom`, `focusInput`, `getViewport`).
  - `AparteUiHandle` (and `AparteUiProps` where idiomatic) exported from every barrel, not just
    React's.

### Patch Changes

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

- 0aefd9b: README quick-start no longer re-adds the user message in the `messageSent`/`onSend` handler:
  the chat appends it automatically on send, so the previous example rendered every sent message
  twice (Angular: discarded the optimistic message via a `[messages]` round-trip). Now aligned
  with the wrapper JSDoc and the tested playgrounds.
- f8a6dd7: De-duplicate the wrappers' `AparteUi` prop-applier. The four wrappers each
  carried a byte-identical vanilla-DOM prop applier + event list; they're now in
  `@aparte/core` as `applyElementProps(el, props, transformValue?)` and
  `DEFAULT_UI_EVENTS`. Vue passes `toRaw` as the transform to unwrap its reactive
  proxy. No public wrapper API change.
- f2d75b0: Fix four teardown/cancellation bugs: the model selector could permanently lock itself out
  of re-rendering if its render threw (now `try/finally`); the Angular Observable to
  async-iterator adapter could hang forever if torn down mid-`await` (its `return()` now
  settles the pending read); and the OpenAI-compat and AI-SDK providers now `cancel()` the
  underlying stream on consumer cancel instead of draining the vendor body to the end (AI-SDK
  also can no longer process a second terminal event).
- Updated dependencies [6ab5682]
- Updated dependencies [930a108]
- Updated dependencies [4065fd6]
- Updated dependencies [307039b]
- Updated dependencies [4aac26d]
- Updated dependencies [a2ed74b]
- Updated dependencies [a6ed936]
- Updated dependencies [333d301]
- Updated dependencies [14f1f1d]
- Updated dependencies [18d2065]
- Updated dependencies [6d6123e]
- Updated dependencies [97bd6c5]
- Updated dependencies [8417976]
- Updated dependencies [1f6c43e]
- Updated dependencies [7157ad5]
- Updated dependencies [2efef6f]
- Updated dependencies [0aefd9b]
- Updated dependencies [0aefd9b]
- Updated dependencies [9568c6b]
- Updated dependencies [7e5cfb7]
- Updated dependencies [75af64a]
- Updated dependencies [fa5a3f8]
- Updated dependencies [69525ad]
- Updated dependencies [8a3890b]
- Updated dependencies [d31f681]
- Updated dependencies [e69435f]
- Updated dependencies [bfa9901]
- Updated dependencies [49f4d70]
- Updated dependencies [fcff831]
- Updated dependencies [455fc81]
- Updated dependencies [554e4e9]
- Updated dependencies [6a50004]
- Updated dependencies [f8a6dd7]
- Updated dependencies [9ce7978]
- Updated dependencies [e96920a]
- Updated dependencies [d60e2c8]
- Updated dependencies [e8d9b32]
  - @aparte/core@1.0.0
