# @aparte/angular

## 0.16.9

## 0.16.8

## 0.16.7

### Patch Changes

- 9df0877: Every package names its documentation page (`homepage`) — nothing in the code changes.

  npm shows the link first on each package page; none of the twenty had one. Each now
  points at its own docs page, verified live before it was written.

## 0.16.6

### Patch Changes

- e8043ba: npm keywords carry the words people actually type — nothing in the code changes.

  Core goes from 5 keywords to 19 (chat-ui, ai-chat, chatbot, chat-component,
  custom-elements, framework-agnostic, the four framework names, agent, tool-calling,
  human-in-the-loop, openai); each wrapper gains chat-ui and ai-chat. Measured against
  the category's incumbents: none of ours were the terms a search starts from.

## 0.16.5

## 0.16.4

## 0.16.3

## 0.16.2

### Patch Changes

- 9df343c: `overlay-composer` on `<aparte-chat>` (and `overlayComposer` on all four wrappers): the transcript's scroll surface spans the whole column and the composer floats over it, so the scrollbar runs edge to edge instead of stopping at the composer's top — the full-page anatomy the Layout guide sold without this half. Opt-in, never the default: a chat embedded in a small box should not have its composer eating the transcript.

  The viewport leaves the flow (absolute over the shell); elicitation, an above-composer row and the composer keep flowing, bottom-anchored, painted over it. The viewport measures that stack and publishes `--aparte-bottom-inset`; content, the spacer and the scroll button clear it — and its readers are unconditional (0px unset), so a host that overlays a composer of its own can write the variable by hand without the attribute. When the composer grows under a reader pinned at the bottom, the inset is re-measured and the reader re-anchored in the same observer pass — the view-jump every hand-rolled overlay hits.

  The attribute is read when the viewport wires its observers: set it in the initial markup. Angular binds it on its inner `.aparte-chat-container` (there the host is the `aparte-chat` element and the viewport is the inner div's child) — use the `overlayComposer` input.

## 0.16.1

## 0.16.0

### Minor Changes

- e4b1fbe: The conversation-manager helper of each wrapper (`useConversationManager`, `createConversationManager`, `ConversationManagerService`) exposes `pin(id)`, `unpin(id)` and `updateTitle(id, title)`, so the list's new `aparte-pin-conversation`, `aparte-unpin-conversation` and `aparte-rename-conversation` events can be wired without reaching for the manager. Angular's `<aparte-conversation-list>` directive gains the matching `(pinConversation)`, `(unpinConversation)` and `(renameConversation)` outputs.
- 4e04443: The four wrappers render `<aparte-elicitation>` inside their host by default; pass `elicitation={false}` (`:elicitation="false"` in Vue, `[elicitation]="false"` in Angular) to opt out. **If your app registers its own presenter with `setElicitationPresenter()`, you must pass it**: the built-in presenter registers with the chat as its owner and wins the match for that chat's requests, so without the opt-out your questions would open core's panel instead of your presenter.

  Core's `<aparte-chat>` has shipped the presenter in its default composition since the built-in approval gate started asking through it, and the wrappers had not followed: a `requestUserInput()` under `<AparteChat>` rejected with the "no presenter" warning, and that warning told you to add the element "inside your `<aparte-chat>`" — a tag the wrappers do not render. The first consumer to hit it appended the element to `[data-aparte-chat]` by hand. The warning now names the framework host too, and the composer's docblock names the four lifecycle events that drive its `streaming` flag (`aparte-message-start` sets it; `-done` / `-error` / `-aborted` clear it) instead of "lifecycle events on window".

### Patch Changes

- 3e460f3: All twenty generated element directives are exported — `AparteContextDirective`, `AparteIconDirective` and `AparteSuggestionsDirective` were missing from a hand-written list, so `<aparte-icon>`, `<aparte-suggestions>` and `<aparte-context>` were tags nothing claimed. `provideAparte({ themeMode })` reads Angular's injected `DOCUMENT` instead of the globals, so an app initializer no longer touches `document`/`window` under Universal.
- 1b1a715: The bubble each wrapper renders carries `data-kind="compaction"` when the message is the summary `compact()` injected (`message.compaction`), so the notice is drawn as a notice — centred, no avatar, no actions — under a framework too, not only under the vanilla viewport.
- 4123389: `<AparteUi>` forwards ten events it used to swallow when you pass no `events` of your own: `aparte-suggestion`, `aparte-context-threshold`, `aparte-scroll-rail-jump`, `aparte-sidebar-toggle`, `aparte-split-resize`, and the turn's lifecycle — `aparte-message-start`, `aparte-message-done`, `aparte-message-error`, `aparte-message-aborted` and `aparte-tool-approval-request`.

  No wrapper code changed: the default list is `APARTE_DEFAULT_UI_EVENTS`, it lives in `@aparte/core`, and the ten names joined it there. It is repeated here because this is the CHANGELOG a wrapper consumer reads, and the effect is theirs — watching a turn end used to mean reaching past `<AparteUi>` for a `window` listener, and this release's shell elements (`<aparte-sidebar>`, `<aparte-split>`, `<aparte-scroll-rail>`) speak through the proxy from their first version. This release's own new events — `aparte-link-click`, `aparte-rename-conversation`, `aparte-pin-conversation`, `aparte-unpin-conversation` — joined the same list at birth, so the constant grew by fourteen names in all.

  If you pass your own `events` array you are unaffected: that list is used verbatim, as before.

## 0.15.1

## 0.15.0

### Minor Changes

- 7502ed0: `appendMessage(message, { historical: true })` now reaches the host from every wrapper — the React ref handle and `useAparteChat`, the Vue instance and `useAparteChat`, the Svelte component and `createAparteChat`, the Angular component — and `AparteChatImperativeApi` declares the option. A restored message is adopted as it is: no fresh timing stamps, `isStreaming` forced off, so a tool call read back from your own backend renders settled rather than spinning.

  The host had accepted the option all along (it is how a stored conversation loads), but every wrapper's `appendMessage(m)` dropped the second argument on the way, so the replay-one-message-at-a-time path the core tests exercise was unreachable from a framework. Found by the second consumer, whose history lives on its own server.

## 0.14.0

### Minor Changes

- 1412c54: `setSkeletonProvider`, `getSkeleton`, `AparteSkeletonProvider`, `AparteSkeletonType` and `APARTE_DEFAULT_SKELETON_FALLBACKS` are removed from `@aparte/core`, and `provideAparte({ plugins: { skeleton } })` from `@aparte/angular`. The `.aparte-skeleton` CSS recipe stays. If you registered a skeleton provider, delete the call: nothing read it.

  Nothing in core ever called `getSkeleton()` — no component has a loading state that is not the message itself, so the seam was a contract with no consumer on either side, and the six fallback strings it shipped (and their four CSS classes) were dead weight in every bundle. A consumer who wants a placeholder uses the recipe, which is the part that was real.

## 0.13.1

## 0.13.0

### Patch Changes

- c236992: Fixed: every package accepted a `@aparte/core` it cannot actually work with.

  All fourteen declared `"@aparte/core": ">=0.7.0 <1.0.0"` while sitting at 0.12.1 and
  importing symbols core does not export before 0.11.0 (`AparteElementAttributes`,
  `AparteTemplateAttrs`, `AparteElementTagName`) or before 0.12.0 (`AparteUiEventName`) —
  read from `src/index.ts` at each release tag, not inferred. npm and pnpm both ACCEPT
  `@aparte/react@0.12.1` beside `@aparte/core@0.7.0`, say nothing, and hand you a tree
  whose types cannot compile.

  These packages are published in lockstep and are never tested apart, so the floor is the
  release. It now says so, and `pnpm version-packages` moves it with every bump — the floor
  went stale because the bump was the one place nothing updated it.

## 0.12.1

## 0.12.0

### Minor Changes

- 2ac6080: **Four critical defects from the 0.11.0 cold audit.** Each one is a place where two things had to agree and nothing checked that they did.

  **A refusal's words now reach the model on the engine path too.** `runStreamAgent` hardcoded _"Tool execution was rejected by the user."_ and never read `decision.instruction` — which its own resolver type declares and core's inline loop uses. So on the recommended path (ratified decision #6), a user who refused a tool and typed "use the staging bucket instead" had those words dropped before the model saw them. Handing the model a turn after a refusal exists _so that it reads the refusal_; there was nothing to read.

  The parity suite could not see it: its resolver returned `{ approved }` and never an instruction, so both loops agreed on a case neither ran. It supplies one now, and asserts the sentence survives rather than only that the two sides match — agreement alone passes if both drop it.

  **Two chats on one page no longer fight over the presenter.** `<aparte-elicitation>` entered `<aparte-chat>`'s default composition in 0.11.0, so two plain chats each registered on the same config — which held ONE slot. The second clobbered the first (chat A's approval opened under chat B, and answering it there decided A's tool call), and when B unmounted it cleared the slot, leaving A mounted with a working presenter that never re-registered: every later approval and every `ask_user` in A rejected `no-presenter` for the life of the page, silently, because that warning fires once per config.

  It is a stack now, each entry carrying the element that registered it, and a request naming a `target` is routed to the presenter in the **same** chat. `AparteElicitationRequest.target` was already documented as "used to resolve WHICH instance presents"; the single slot is what made that impossible.

  **New:** `AparteConfig.removeElicitationPresenter(fn)` withdraws one presenter by name. `setElicitationPresenter(presenter, owner?)` takes an optional owner element. `setElicitationPresenter(null)` still means "turn it off" and clears all.

  **`hidePanel()` no longer orphans an open request.** The no-token form called the silent teardown, which nulls `onEvict` without calling it — so the documented public call closed an approval panel without telling its owner. The promise stayed pending, the approval `await` has no timeout, and because `requestUserInput` chains each request on the previous one, **no further question or approval on that config was ever presented again**. The old JSDoc justified the silent branch as "what `reset()` needs"; `reset()` calls `_evictPanel()`, which notifies. Both forms notify now, except a token-matched close — that is the owner closing its own panel, and it already knows.

  **Breaking, pre-1.0: `[multiple]="false"` used to turn multi-file selection ON.** The bindings generator modelled every boolean attribute as a _presence_ attribute, and core has two that are three-state — default on, off only via the literal `"false"`: `multiple` on `<aparte-composer-add-attachment>` and `submit-on-enter` on `<aparte-composer>`. For those, `false` REMOVED the attribute, which the element reads as true. The only value that turned it off was a string no binding could produce and no template type could express.

  `true` now writes the empty presence value and `false` writes `"false"`, and the attribute type widens to `boolean | 'false'` so OFF is expressible in React, Vue and Svelte as well. **If you passed `''`/`undefined` to force one of these off, it never worked; pass `false` (Angular) or `'false'` (templates).**

  Two attributes join the typed surface, having been read lazily via `getAttribute` and so invisible to the manifest: **`submit-on-enter`** on `<aparte-composer>` and **`action-id`** on `<aparte-composer-action>` — the latter being the only way to tell two custom composer buttons apart.

  And `aparte-action-click` now declares its detail type, so Angular's `(actionClick)` emits `AparteActionClickEventDetail` instead of `void` with `$event` discarded.

## 0.11.0

### Minor Changes

- 9e30879: **Every aparté element now has a typed surface in all four frameworks.**

  Placing an element used to mean one of two things: a stringly-typed proxy, or nothing at all. In Angular it was `<aparte-ui name="aparte-model-selector" [props]="{…}" (elementEvent)="…">` — a tag name as a string, an untyped bag of props mixing DOM attributes with CSS variables, one output for every event, and an element created imperatively so no `@if`, `@for` or content projection could reach it. In React it was nine tags declared `any`.

  `@aparte/core` now declares each element's attributes once — `AparteElementAttributes`, keyed by `AparteElementTagName`, with a per-element interface exported for each. Every wrapper derives from that registry rather than listing tags, so an element added to core is typed everywhere the moment it lands.

  - **React** — the `aparte-*` JSX intrinsics are typed. A wrong value type is a compile error.

    _Amended after release:_ this said "a typo, a wrong value type, or an attribute the element does not observe is a compile error". The value half holds; the other two do not, for the hyphenated names the sentence used as its own examples. TypeScript treats a JSX attribute whose name is not a valid JS identifier as "known" even when it is absent from the attributes type, so none of the 12 hyphenated aparté attributes is typo-checked — `max-rendered-bubles={200}` compiles. Presence-attribute enforcement is unaffected.

  - **Vue** — declared through `GlobalComponents`, checked by `vue-tsc`.
  - **Svelte** — declared through `SvelteHTMLElements`, checked by `svelte-check`, including `on:` handlers derived from the DOM event map.
  - **Angular** — a standalone directive per element, exported individually and as `APARTE_ELEMENT_DIRECTIVES`. Real `@Input()`s that write attributes (never properties — eight of `<aparte-composer>`'s accessors are getter-only), one typed `@Output()` per event emitting the event's detail, and the real tag in the template so control flow and projection work. It also means **no `CUSTOM_ELEMENTS_SCHEMA`**, which used to switch template checking off for every unknown tag in the file.

  In the three template languages a presence attribute is `'' | null | undefined`, not `boolean`: all three stringify what they set on a custom element, so `searchable={false}` would render `searchable="false"` and an element testing `hasAttribute` reads that as on. Angular's directives take a real `boolean` and write the attribute themselves. `AparteTemplateAttrs` and `AparteAttrValue` are exported if you build your own integration.

  `<aparte-ui>` is unchanged and still ships. It is the escape hatch for an element aparté does not define — one of yours, or a third party's — rather than the way to use aparté's own.

  Also fixed while typing it, all found by the compiler rather than by reading: six attributes were documented as strings while the element treats them as booleans or numbers; `timestamp` accepts a number as well as a string; `framework-managed` is a real attribute of the contract that all four wrappers set, core reads on two elements, and nothing declared; and `max-messages` is marked deprecated in favour of `max-rendered-bubbles`, which the element has been warning about at runtime.

  New docs page: [Placing elements, typed](/frameworks/elements/).

- 2f6180e: **A wrapper types only what it depends on.** `AparteModelSelectorDirective` and `AparteAskUserDirective` are removed from `@aparte/angular`; `aparte-model-selector` and `aparte-ask-user` are removed from core's `AparteElementAttributes` registry, along with the `AparteModelSelectorAttributes` export; and `aparte-model-change` is removed from `APARTE_DEFAULT_UI_EVENTS`.

  They were added hours earlier in the same release, and the reason to take them back out is the one that matters: **a third-party plugin's author cannot add a line to `@aparte/core`.** Typing our own plugin's element from core and shipping its directive from the wrapper gave aparté's packages a privilege nobody else's plugin could have — an asymmetry baked into the library before it has an ecosystem.

  The rule that replaces it is symmetric and states in one line: **whoever owns the element owns its contract and its bindings.** Core's elements are typed by core and wrapped by the wrappers. Everything else — a plugin's element, ours or yours — is typed by its owner, or in six lines by the app that places it. Both mechanisms are documented, and both are exactly the same work for us as for anyone: module augmentation for React/Vue/Svelte (types only, no runtime, applies exactly when the package is installed) and a directive for Angular, whose only non-obvious part — attribute versus property — is `applyElementProps`, already exported.

  Nothing about core's own 18 elements changes: their attributes, the 26 declared events with 20 typed details, the JSX/Vue/Svelte typing and the 17 Angular directives all stay.

  The Angular example keeps its `CUSTOM_ELEMENTS_SCHEMA` removed.

  _Amended after release:_ this said the example "now declares its own six-line directive for the model selector instead of importing one". It does not — it imports the directive from `@aparte/plugin-model-selector/angular`. The plugin shipped that subpath later in the same release and the example was switched back to it, but this paragraph was not re-measured before publishing. The pattern itself is documented, with a worked example, at `/frameworks/elements/#your-own-element-or-a-plugins`.

### Patch Changes

- 093a196: **The element bindings are generated from the manifest, not written by hand.** 675 lines of
  hand-maintained declarations out — 435 of Angular directives and 240 of attribute interfaces — for a
  335-line generator and a 55-line config file, which three packages now share.

  Core's attribute registry and the 17 Angular directives were a parallel structure over facts the custom-elements manifest already carried, with nothing watching them. Add an attribute to an element and the manifest records it, the registry records it, and React, Vue and Svelte type it automatically — they derive from the registry through a mapped type. Angular would silently not, because an `@Input()` is a hand-written member. Nothing would go red, and the Angular wrapper would be quietly behind within days.

  `scripts/gen-element-bindings.mjs` now emits both from `dist/custom-elements.json`, into gitignored `src/generated/` directories rewritten on every build — the same pattern the docs' two generated reference pages already use, so there is no committed artifact that can fall behind and no new guard.

  The generator was checked differentially against the output it replaced, and reproduced it: the same 15
  interfaces carrying the same 48 attribute members, the same 17 directives, the same 24 Outputs. It
  differs in exactly one place — 41 Inputs where the hand-written directives had 40, because it picked
  up `framework-managed` on `<aparte-chat-viewport>`, an attribute core's registry declared and the
  hand-written directive had missed. That is the drift this change exists to make impossible, found in
  the artefact being deleted. The 109 directive tests pass unchanged against the generated file.

  What cannot be derived lives in `packages/core/element-bindings.config.mjs`, visible rather than buried in a generator branch: `role` on the bubble is omitted as an Input because that name is ARIA's, `data-empty` on the toolbar is omitted because the element reflects it onto itself, and `aparte-abort` / `aparte-message-aborted` get no Output because they are dispatched on `window` where a host listener could never hear them.

  No public API changes: the same types and the same directive names are exported, from a generated file instead of a hand-written one.

## 0.10.0

### Minor Changes

- 0fed195: **Removed: the `terminal` segment type, with its event and its host handler.** Breaking, pre-1.0, no shim.

  Gone from core: `{ type: 'terminal' }`, `AparteTerminalSegment`, the renderer, 117
  lines of CSS and 11 `--aparte-terminal-*` variables, the `aparte-terminal-run` event
  and its `AparteTerminalRunEventDetail`, and the `terminalRun` host handler. The four
  wrappers stop re-exporting the two types. Core ships eight segment kinds now.

  **No protocol has a "terminal".** When ChatGPT shows one, that is a **tool call**: the
  model emits a call whose arguments are code, and the client renders the _result_ in a
  monospace pane. Same in a console agent — `bash` is a tool, the app runs it, the app
  prints the output. The name in the wire format is the tool's (`code_interpreter`,
  `bash`, `run_command`); "terminal" is a UI convention, not a kind of content.

  The evidence was in the type all along. `exitCode` and `isRunning` are not things any
  protocol provides — a tool result is a string. Those two fields are the signature of a
  component written for an app that owned the execution, not for a library rendering a
  protocol. Consistent with that: nothing in the library ever emitted one — no parser,
  no client, no example, no browser test.

  **What to do instead.** Register a renderer for your own tool and it draws inside the
  `tool_call` segment, where the request and the result already live:

  ```ts
  config.registerToolRenderer("bash", myConsoleRenderer); // or 'run_command', 'python'
  ```

  That is the seam this belonged in, and it puts the naming where it belongs: core cannot
  know what your tool is called, and baking one vendor's tool name into a
  framework-agnostic library would be wire-format knowledge in the wrong layer.
  `@aparte/plugin-ask-user` is the same shape end to end if you want a worked example.
  If you need a standalone console block with no tool behind it,
  `registerSegmentRenderer` still takes a type of your own — that path is unchanged.

  The `terminal` **icon key** stays in the icon provider: a consumer writing their own
  console renderer will want `getIcon('terminal')`, and an icon name costs nothing.

  Migration: delete your `terminal` segments, or move them behind
  `registerToolRenderer` / `registerSegmentRenderer`. If you declared
  `setHostHandlers({ terminalRun: true })`, drop that key — the others are unchanged.

## 0.9.0

## 0.8.0

### Minor Changes

- 688a231: Remediation of a from-scratch audit: four CRITICAL and nineteen MAJOR defects, plus the
  guards that make each class unrepeatable.

  **Fixes you will notice**

  - **Pressing Stop no longer erases the answer.** A stopped turn replaced everything
    already streamed with an error bubble, and never dispatched `aparte-message-aborted`.
    Three separate paths had to be closed: an abort arriving while the loop was parked on
    its read, `openai-compat` reporting an `AbortError` as a stream error where `ai-sdk`
    stays quiet, and a rejection escaping `transportCall` before the first event.
  - **A code fence split across deltas no longer eats the text before it**, and no longer
    leaks a literal ` ```python ` into the message.
  - **A split `<artifact` tag no longer loses its whole lifecycle.** `<` and `artifact` are
    separate tokens in most vocabularies, so whether artifact events fired depended on
    where the tokenizer cut.
  - **A turn the human stopped, stops.** A rejected tool no longer lets the rest of that
    turn's tool calls run.
  - **`compact()` only touches its own chat.** With two clients on a page, one event made
    both summarise the same conversation and wiped the other with no summary.
  - Retrying the first message no longer resends the whole conversation. Viewport listeners
    no longer accumulate when the element is moved in the DOM. A stream we walk away from
    is cancelled rather than left generating.

  **Breaking**

  - **A previewable artifact no longer runs the model's code without a user gesture.** The
    card opened on Preview with the frame already mounted, so every render of a completed
    artifact — including reloading a persisted conversation — executed model-authored JS.
    It is sandboxed, so this was a prompt-injection surface rather than origin XSS. The
    frame is now created only when the user presses Preview, and is CSP-constrained. An app
    that wants it open must open the tab itself.
  - **`authorize` is required on `createAparteChatHandler`.** The endpoint spends your
    server-held key, and both the JSDoc example and the docs snippet omitted it — the
    copy-paste path was the unauthenticated one. `authorize: () => true` still works, but
    now someone wrote it on purpose. Vendor error bodies are summarised instead of relayed,
    because an OpenAI 401 hands the caller your key's prefix and tail.
  - **`streamRunner: runStreamAgent` finally typechecks.** Making it compile required
    narrowing `role`, mirroring the content-part union and the tool types, declaring
    `modelId`, and removing three index signatures from `@aparte/engine`'s mirror types. A
    consumer who wrote their own `StreamAgentMessage` may need to adjust.
  - `@aparte/engine` no longer re-exports `deriveArtifactKind` — it collided with
    `@aparte/core`'s export of the same name, with a different function behind it.
  - `escapeHtml` / `escapeAttr`, `AparteHostHandlersConfig` and `AparteKeyProvider` are now
    exported from `@aparte/core`.
  - **Ten exports are renamed**, before 1.0 makes their names permanent. The four classes
    gain the prefix every other class already carried, and the six shared defaults gain a
    namespace so they cannot collide with an app's own:

    | before                       | after                               |
    | ---------------------------- | ----------------------------------- |
    | `DirectTransport`            | `AparteDirectTransport`             |
    | `BackendTransport`           | `AparteBackendTransport`            |
    | `MessageRepository`          | `AparteMessageRepository`           |
    | `ConversationManager`        | `AparteConversationManager`         |
    | `DEFAULT_LOCALE`             | `APARTE_DEFAULT_LOCALE`             |
    | `DEFAULT_UI_EVENTS`          | `APARTE_DEFAULT_UI_EVENTS`          |
    | `DEFAULT_ICON_FALLBACKS`     | `APARTE_DEFAULT_ICON_FALLBACKS`     |
    | `DEFAULT_BUBBLE_ACTIONS`     | `APARTE_DEFAULT_BUBBLE_ACTIONS`     |
    | `DEFAULT_HOST_HANDLERS`      | `APARTE_DEFAULT_HOST_HANDLERS`      |
    | `DEFAULT_SKELETON_FALLBACKS` | `APARTE_DEFAULT_SKELETON_FALLBACKS` |

    Functions keep their verb names — `registerDefaultRenderers`, `contentToText`,
    `filesToAttachments` and the rest are unchanged, because prefixing a verb reads worse
    than the inconsistency it would fix.

  - **The config naming is inverted: `AparteConfig` is now the class, and the page-wide
    instance is `aparteGlobalConfig`.** `AparteConfigClass` is gone.

    ```diff
    - import { AparteConfig, type AparteConfigClass } from '@aparte/core';
    - AparteConfig.setMarkdownProvider(provider);
    - function configure(config: AparteConfigClass) {}
    + import { aparteGlobalConfig, type AparteConfig } from '@aparte/core';
    + aparteGlobalConfig.setMarkdownProvider(provider);
    + function configure(config: AparteConfig) {}
    ```

    One `sed` covers a whole consumer, and the order matters — run the instance first, so
    that `\bAparteConfig\b` cannot yet match the class:

    ```bash
    # 1. the instance, then 2. the class. Never the reverse.
    grep -rlE '\bAparteConfig(Class)?\b' src \
      | xargs perl -pi -e 's/\bAparteConfig\b/aparteGlobalConfig/g'
    grep -rl 'AparteConfigClass' src \
      | xargs perl -pi -e 's/\bAparteConfigClass\b/AparteConfig/g'
    ```

    It rewrites string literals too, so a log prefix of your own like `[AparteConfig]`
    becomes `[aparteGlobalConfig]` — harmless, but check your diff if you grep your logs.

    Two reasons this happens now rather than never. `AparteConfigClass` was not a name, it
    was an admission — the `Class` suffix existed only because the good name was taken by an
    object, and PascalCase means constructor everywhere else in the ecosystem, so
    `AparteConfig.setMarkdownProvider(...)` read as a static method to every reader. And the
    library moved under it: since config became per-instance, the global singleton is one
    config among several and the one we recommend least. Giving it the canonical name
    pointed at the case we want people to outgrow; `aparteGlobalConfig` says at every call
    site which config you are touching.

  - **`@aparte/provider-transformers`: `terminateWorker()` no longer bricks the provider.**
    Called while a generate was in flight, it dropped the pending streams but left their
    serialization slots unresolved — so the next `chat()` awaited a promise that could never
    settle. No error, no rejection: the stream simply never started again, for the life of
    the page. The worker-error path already released those slots, with a comment explaining
    why; `terminateWorker`, 240 lines below it, did not.

    Its state is still **tab-scoped, on purpose**, and now says so: one worker, one loaded
    model, one generate at a time, with `setComputeDevice` / `setMaxCachedModels` /
    `setHardwareTierModels` applying page-wide. A local model is 1–2 GB of weights and one
    WebGPU pipeline, so a worker per chat would mean N copies resident in one tab — the
    failure this package exists to avoid. Two chats on the same model share the load, which
    is the case it is for. Two chats on _different_ models serialize and, at the default
    budget of one cached model, can evict and reload gigabytes between turns — that used to
    happen in silence and now warns once, naming both models.

    `TransformersProvider.chat` is also declared non-optional now, so consumers stop needing
    `provider.chat!(...)`.

  - **Seven documented event contracts are gone, because those events never existed.**
    Not "undocumented" — the name appeared in the repo only in its own declaration.
    `aparte-artifact-open` sat in the event map with a detail type asserting it is
    "dispatched by the artifact pill when a user clicks it"; three hits repo-wide, all
    three its own declaration.

    | removed                             | why                                                                                                             |
    | ----------------------------------- | --------------------------------------------------------------------------------------------------------------- |
    | `AparteTokenEventDetail`            | `aparte-token` is dispatched nowhere                                                                            |
    | `AparteMessageEventDetail`          | `aparte-message` is dispatched nowhere                                                                          |
    | `AparteStatusEventDetail`           | `aparte-status` is dispatched nowhere                                                                           |
    | `AparteToolActionDetail`            | its JSDoc names `aparte-tool-action`, which does not exist                                                      |
    | `AparteSegmentActionEvent`          | `aparte-segment-action` does not exist                                                                          |
    | `AparteConversationUnarchiveDetail` | a dead type on a live event — the dispatcher types both archive branches with `AparteConversationArchiveDetail` |

    Two were renamed rather than deleted, because their shape was right and only the
    event they named was wrong:

    ```diff
    - import type { AparteArtifactOpenEventDetail, AparteSegmentUpdateEvent } from '@aparte/core';
    + import type { AparteArtifactRedownloadEventDetail, AparteSegmentUpdateEventDetail } from '@aparte/core';
    ```

    `AparteArtifactRedownloadEventDetail` is field-for-field what the Download button
    really dispatches. `AparteSegmentUpdateEventDetail` was a detail, not an event, and
    had never reached a package entry point at all — so you could bind an event listed
    in the published API table and never name its detail. Same for
    `AparteConversationArchiveDetail`, now exported.

  - **Twenty events gained a typed `detail`, so the cast the docs promised you would
    never write is finally unnecessary.** The map carried 17 entries against 37 events
    that dispatch a detail. Fourteen had no declared type anywhere — including
    `aparte-file-gen-ready` / `-error`, where core renders a "Running sandbox…" card and
    waits on `window` for an event nothing in the library emits, so a consumer had to
    reverse-engineer six fields from an inline cast to make a binary artifact ever
    finish. Six more had a public detail type and still forced a cast at every listener.

    Additive for your code, and `check:event-map` now enforces both directions: an event
    with a detail must be in the map, and a map entry must correspond to a real event.

  - **`AparteThemeVariables` is `{ [K in `--aparte-${string}`]?: string }`.** It was a
    hand-written list of 33 CSS properties, ten of which are neither declared nor read
    anywhere in aparté — so it autocompleted ten knobs that do nothing — while the real
    surface is 254 tokens. You lose autocomplete and gain a type that cannot lie; the
    231 tokens the old list omitted, the whole `aparte-select` surface included, now
    typecheck. The discoverable list is the generated CSS-variables reference.

  - **One name for the imperative surface: `AparteChatImperativeApi`.** React exported it
    as `AparteChatHandle`, Vue and Svelte as `AparteChatInstance`, and Angular exposed no
    name at all — one contract wearing three names in a suite that publishes all four
    together in lockstep. Both aliases are gone; every wrapper now re-exports the canonical
    type straight from `@aparte/core`, which is also where its documentation lives, so the
    names cannot drift again.

    ```diff
    - import { AparteChat, useAparteChat, type AparteChatHandle } from '@aparte/react';
    + import { AparteChat, useAparteChat, type AparteChatImperativeApi } from '@aparte/react';
    ```

    Same rename for `AparteChatInstance` in `@aparte/vue` and `@aparte/svelte`. Nothing
    about the shape changed — it was already an alias of the same type in all three.

  - **`AparteAIProvider` is a union instead of one permissive interface.** It had three
    required members and fifteen optional ones, holding two mutually sufficient execution
    surfaces — a `chat()` that owns its own I/O, or the format-adapter surface a transport
    drives — discriminated at **runtime** by `isFormatAdapter()`. So
    `{ id, getMetadata, getModels }` typechecked, registered without a word, and failed on
    the first message. A half-built adapter (`buildRequest` but no `parseStream`) did the
    same, and so did a complete adapter with no way to present a key.

    Now the compiler answers "which half did you implement?". Every member of both
    surfaces stays reachable on the union — optional on the arm that does not require it —
    so `typeof p.buildRequest === 'function'` probes and `isFormatAdapter()` narrowing are
    unchanged, and a provider implementing both surfaces is still valid. If your provider
    was complete it compiles as before; if it was one of the shapes above, it never worked.

  - **Every satellite's peer on `@aparte/core` is now the lockstep range** (`~0.8.0`)
    instead of `>=0.5.0-alpha.0 <1.0.0`. The suite has always published in lockstep, so
    that range described a compatibility promise nobody was making or testing: npm was
    happy to install `@aparte/react@0.8.0` beside `@aparte/core@0.5.0`, and the failure
    landed at runtime with no warning at install. This very release makes the point —
    under the old range, `@aparte/react@0.8.0` would install against `@aparte/core@0.7.1`
    and then fail on an `aparteGlobalConfig` that does not exist there.

    If you install the packages together, or with `latest`, nothing changes. If you were
    pinning `@aparte/core` behind the wrappers, npm now tells you at install time instead
    of at first render.

  - `@aparte/svelte` ships its `.svelte` sources instead of a precompiled bundle, and
    supports Svelte 4 **and** 5 (`^4.0.0 || ^5.0.0`). Nothing to change in your code, unless
    you were importing from a deep path inside `dist`.
  - Every plugin `setup*` takes an optional trailing `config`, so a plugin can be scoped to
    one chat instead of the global singleton. Existing calls are unaffected.
  - `AparteClient` accepts `toolTimeoutMs`, matching `runStreamAgent`'s option of the same
    name — it was previously a hard-coded constant, so setting it worked on one loop only.

  **Security**

  Nine private copies of the HTML-escaping helper became one; three of them had drifted to
  leave the apostrophe through, which is enough to break out of a single-quoted attribute.
  42 unescaped attribute interpolations were swept (the audit reported 3). Segment lookups
  are scoped to their own children, so a decoy `data-segment-id` in model markdown can no
  longer hijack a human-in-the-loop control. A style declaration containing a backslash is
  rejected outright, and a `data:` image URL must name its subtype.

  `srcset` now goes through the same URL allowlist as `src`. It had only a
  `javascript:`/`vbscript:` substring test, so `srcset="data:text/html,<script>..." `
  passed untouched while the identical URL on `src` was rejected — one allowlist giving
  two answers depending on which attribute carried the URL. Each scheme in the value is
  validated rather than splitting on commas, because a legitimate base64 `data:` URL
  contains one.

  `data:image/svg+xml` is deliberately KEPT in the allowlist, contrary to an earlier plan
  to drop it: inside an `<img>` a data-URL SVG is secure-static in every engine (no
  scripts, no external fetches), and removing it would break a model emitting an inline
  chart. What it must not do is travel — an app that moves such a URL into an `<object>`,
  `<embed>` or an iframe leaves secure-static mode, and that constraint belongs to
  whoever re-hosts it.

  **Also in this release**

  - **Elicitation stops inventing refusals.** With no presenter registered,
    `requestUserInput()` resolved `{ action: 'cancel' }` in silence: your tool reported a
    refusal the user was never asked for, and the model answered as though they had
    declined. It still resolves `cancel` (a question nobody can render cannot be awaited)
    but now warns once, and the guide shows the `<aparte-elicitation>` element you must
    place — it registers itself on connect, so nothing happens until it is in your markup.
  - **`@aparte/svelte` publishes resolvable types.** `types` was not first in its
    `exports` block, and export conditions are order-sensitive, so TypeScript could not
    resolve the package's types at all. The `svelte` condition now carries its own `types`,
    matching how core's `node` condition is built.
  - `escapeHtml` / `escapeAttr` / `cssEscape` are documented with an example instead of
    being mentioned in passing: which one belongs in markup, which in an attribute, which
    in a selector, and why the apostrophe matters. They were exported all along while a
    comment in their own file claimed they were internal.
  - `AparteClientOptions.toolTimeoutMs` is in the config reference. The `config` argument
    every plugin `setup*` takes is documented with an example — it was named nowhere, and
    it is what lets two chats on one page use different providers.

  - **Segment renderers are per config too, so the `config` prop is now honest end to
    end.** `registerSegmentRenderer`, `unregisterSegmentRenderer`, `getSegmentRenderer`,
    `getAllRenderers`, `collectRendererStyles`, `registerDefaultRenderers` and
    `declineDefaultRenderers` all take an optional trailing config; omitted, they act on
    the ambient or global one exactly as before, so no existing call changes.

    This was the other half of the wrappers' promise. A plugin's providers were already
    scoped, but the registry deciding WHICH renderer draws a segment was a module-level
    Map — two chats on a page shared their segment renderers whatever config they were
    given. `AparteClient({ config, autoRegister: false })` was affected the same way: it
    declined the built-ins on the global config rather than on its own, muting the wrong
    chat.

  - `thinkingDelimiters` is documented, including the two pairs recognised by default and
    the fact that only the bring-your-own-loop path can reach it.

  **A Safari bug the new browser suite found, and closed**

  In framework mode — what every React / Vue / Svelte / Angular consumer runs — a streamed
  transcript settled a deterministic 31px short of the bottom on Safari and stayed there,
  so the last line of a reply sat under the fold. A timeline of a streamed turn showed the
  content settling in TWO layout passes (1118 → 1121 → 1152 px): `scrollTop = scrollHeight`
  ran against the middle one and nothing ran again afterwards. Auto-follow was armed the
  whole time — the viewport was not disarmed, it was satisfied, because "am I at the
  bottom?" is answered with a 50px tolerance that is right for keeping auto-follow armed
  and wrong as a definition of anchored.

  Fixed by a bounded re-check over the next few frames, which stops as soon as the gap is
  closed and re-reads the auto-follow flag every frame so a reader who scrolls away
  mid-settle is left alone. It exists only because a browser test drove a real progressive
  stream through a real engine; no unit test could see it, and the suite that shipped before
  this release delivered every reply atomically.

- 7d6652a: A third cold audit, and the one CRITICAL it found

  Five auditors, five dimensions, no access to the changelog or the git history —
  because a previous round proved seven of the maintainer's own claims false, and an
  auditor who reads the changelog is grading the essay rather than the code. One
  CRITICAL, twenty MAJOR. All twenty-one are closed here.

  **The CRITICAL, and its family.** `<aparte-elicitation>` registered its presenter
  on the config it could resolve at `connectedCallback`. All four wrappers call
  `AparteChatHost.bind()` — which runs `attachConfig` — from a post-mount hook, so
  the element connected _before_ the boundary existed and registered on the global
  singleton. `requestUserInput()` then resolved the instance config, found no
  presenter, and returned `{action:'cancel'}`: **the model was told the user refused
  a question the user was never shown.** Silent, and in the supported multi-chat
  path.

  An earlier sweep for this bug class fixed every element that READS its config live
  and missed both that WRITE to it — a write has already happened, so resolving live
  cannot save it. `attachConfig`/`detachConfig` now notify the subtree, and a
  registrant implements `AparteConfigAware.aparteConfigChanged(next, previous)`.
  Three MAJORs shared the root cause: `<aparte-model-selector>` cached its config
  (and its subscription) at connect; a segment renderer registered the documented way
  landed on the global and was invisible to any chat with a `config` prop — an
  instance config now inherits global registrations; and all four wrapper
  conversation-manager hooks wrote the manager to the global, making `config` +
  persistence a silently degraded mode. `init(adapter, config?)` on all four.

  **The streaming seam lost text three ways.** A non-streaming (string) reply skipped
  the parser flush, so a reply ending on a backtick or `<` lost that tail and one
  made only of those rendered nothing. The XML machine finalized _after_ the parser
  flush, so the text it hands back — always a prefix of `<artifact` — reached a
  parser that would never be flushed again; the loss was total. And the adapter's
  pre-tag path could add a segment but not update one that had just completed,
  freezing a code block mid-fence. The parity suite gained the two scenarios that
  missed all of this by a delta boundary, and it immediately rejected the core-side
  fix as well: it had split one sentence into two segments and put the held prefix
  _before_ the prose it follows.

  **Security.** The artifact preview's `<meta>` CSP was inserted relative to the
  first `<head>` the model's markup declared — and a meta policy governs only what
  follows it, so a `<script>` placed before that tag ran uncontained. Reproduced in
  Firefox, WebKit and csp-attribute-less Chromium; since the `csp` iframe attribute
  is Chromium-only, this meta is the only containment those engines get. Three
  branches collapse to one: always first. `AparteToolRenderer.render` now returns
  `string | HTMLElement` like its sibling, and both it and the guide say that
  `toolCall.input` is model-chosen. And the primary backend-handler snippet no longer
  satisfies the mandatory `authorize` gate with `Boolean(req.headers.get('cookie'))`,
  which authenticates nothing.

  **Migration.** `getHostHandlers()` returns `Required<AparteHostHandlersConfig>` —
  four fields, `artifactRehydrate` included. `AparteToolRenderer.render` widened, so
  existing string renderers keep working. The page-global config moved to a versioned
  `Symbol.for` key: two copies of `@aparte/core` on one page now get one global each
  instead of sharing an object across which `instanceof` is false. The `shiki` and
  `marked` peer ranges narrowed to the majors this repo tests against (`^4` and
  `^18`) — an over-narrow peer is a warning you can override, an over-wide one is a
  lie.

  **Six of the twenty MAJORs were defects in the guards themselves**, which is the
  part worth reading twice. Seven gate steps ran in no CI workflow, five of them
  guards that bite — and the only place their names appeared under `.github/` was a
  comment narrating a previous audit finding the same thing. `check:gate-in-ci` now
  diffs the workflow against the gate chain. `check-event-map` was blind to
  object-shorthand `detail`, exempting the ten most important events.
  `check-doc-snippets` waived every diagnostic in a fence containing one unresolved
  name — 44 of 118 fences, hiding two `for await` SyntaxErrors in the branching
  guide. `check-bundle-entries` read a re-export shim and skipped the chunk where
  core lives, and could not have seen an inlined dependency at all, so it gained an
  assertion that core's manifest declares none. `check-export-mentions` could not see
  type-only exports; measured once it could, 141 public exports were named on no
  page, now on a per-package ratchet that a new component cannot raise.

## 0.7.1

## 0.7.0

### Minor Changes

- acb1e37: **Breaking:** the composer's three positional footer slots become one `toolbar`.

  `footerLeft` / `footerCenter` / `footerRight` (and their `footer-left` / `footer-center` /
  `footer-right` slot equivalents) are removed. Pass one `toolbar` instead and order your
  controls yourself:

  ```tsx
  // before
  <AparteChat footerLeft={<ModePicker />} footerRight={<ModelSelector />} />

  // after
  <AparteChat toolbar={<>
    <ModePicker />
    <ModelSelector style={{ marginInlineStart: 'auto' }} />
  </>} />
  ```

  Placement inside the row is the DOM order; `margin-inline-start: auto` pushes a control —
  and everything after it — to the end. It is a _logical_ property, so a control that used to
  be in the right-hand slot now follows the reading direction instead of contradicting it in a
  right-to-left locale.

  Vue uses `<template #toolbar>`, Svelte `<svelte:fragment slot="toolbar">` (a fragment
  projects several nodes with no wrapper element), Angular `slot="toolbar"` on each projected
  node.

  **New in core:** `<aparte-composer-toolbar>`, the element the row actually is. It works in
  plain HTML with no wrapper, which the row never did before — vanilla consumers had to write
  `<div class="aparte-composer-footer">` by hand. It hides itself while empty, and it is not
  part of the default `<aparte-chat>` shell: nothing is drawn until you put something in it.

  **Also in core:** `<aparte-composer>` now mirrors the locale's reading direction onto
  itself. `dir` was applied by the viewport alone, so an RTL locale flipped the transcript and
  left the composer left-to-right — which also made any logical margin inside it behave like a
  physical one.

## 0.6.1

## 0.6.0

## 0.5.0-alpha.0

### Patch Changes

- Updated dependencies [cd7adfc]
- Updated dependencies [3edb766]
- Updated dependencies [3b026bb]
  - @aparte/core@0.5.0-alpha.0

## 0.4.0-alpha.0

### Minor Changes

- 0aa386e: **Behavior change:** the default composer shell no longer mounts the file picker. All four
  wrappers gained an `attachments` prop (`false` by default) that adds
  `<aparte-composer-add-attachment>` + `<aparte-composer-attachments>` back.

  **Migration:** if your chat offers file attachments, add the prop —
  `<AparteChat attachments />` (React/Svelte), `<AparteChat attachments />` /
  `:attachments="true"` (Vue), `<aparte-chat attachments>` (Angular). Passing your own
  `composer` is unaffected: you place the primitives yourself, as before.

  Why: the picker was hard-coded in the four wrapper templates while core's own
  `<aparte-chat>` default shell never had it — so "the default composer" meant two different
  things depending on where you looked, and the docs described the wrong one. And the
  capability is only real if the host consumes the files: an `AparteClient` inlines them per
  its `rawFileInject` option, but an app driving its own loop must read `event.files` or the
  file the user deliberately attached is dropped in silence, with the UI still showing it was
  sent. Opting in is now that acknowledgement.

### Patch Changes

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

- Updated dependencies [358bc53]
- Updated dependencies [801622a]
- Updated dependencies [0d4945f]
- Updated dependencies [de57a6a]
- Updated dependencies [50d90a8]
- Updated dependencies [cda5f54]
- Updated dependencies [af5ed3d]
- Updated dependencies [e9909c6]
- Updated dependencies [2336bc5]
- Updated dependencies [79b2795]
- Updated dependencies [9f839e4]
- Updated dependencies [80995ea]
- Updated dependencies [118d4fb]
  - @aparte/core@0.4.0-alpha.0

## 0.3.0-alpha.0

### Patch Changes

- Updated dependencies [d4c448b]
- Updated dependencies [0192d63]
- Updated dependencies [7227dee]
- Updated dependencies [622dc78]
- Updated dependencies [7227dee]
  - @aparte/core@0.3.0-alpha.0

## 0.2.0-alpha.0

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
  - @aparte/core@0.2.0-alpha.0
