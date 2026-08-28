# @aparte/plugin-ask-question

## 0.14.0

### Minor Changes

- b4c7365: `createAskUserTool` and `setupAskUser` accept `name`, `description` and `systemPrompt`; `setupAskUser` also takes `receipt: false` to keep the transcript silent. Nothing changes when you pass none of them.

  The tool's name was `ask_user` three times over (the tool, the receipt renderer, the Node entry) and its description and system prompt were fixed English — so a backend that already exposed an `ask_user`, or a product that wanted the model to read another policy in another language, had to fork the tool for two strings. The receipt renderer now registers under whatever name is chosen, and declining the receipt no longer means registering an empty renderer after `setupAskUser` and hoping the order holds.

- 91607bd: The question receipt now shows a success tint and a bar on its start edge once answered (`aparte-mark aparte-mark--success`), and a muted, unmarked look when declined (`aparte-mark--quiet`) — core's `aparte-mark` recipe, so it matches the select's chosen option and a checked field choice. And a `question-receipt` segment an app emits itself can now say `declined: true` — it renders the outcome alone, the way the tool's own receipt already did.

### Patch Changes

- f9b1008: Four visual fixes: popovers and the select dropdown cast a visible shadow, the recommended elicitation option shows one focus ring instead of two, the bubble's action-bar buttons reach the touch-target size on a coarse pointer, and `@aparte/plugin-ask-user`'s receipt shows the answer in the strong text colour instead of green. The shadows are `--aparte-popover-shadow` and `--aparte-select-shadow` — set them yourself if you had: on cream the old one was imperceptible. The recommended option no longer shows its tinted border under the focus ring — one ring at a time. On a coarse pointer the action-bar buttons grow like the other controls already did. And the receipt's green was the one hue outside the palette on the whole transcript.

## 0.13.1

## 0.13.0

### Minor Changes

- 73238ac: The question-receipt's classes stop leaking onto your page.

  **BREAKING for themes of this plugin**: eight names change.

  The plugin styled and emitted seven UNPREFIXED classes. Core renders into the light DOM —
  no shadow root, no `::part()` — so an unprefixed rule in a package a consumer imports is a
  **global** rule on their page.

  `.segment` is the worst of them: it is Semantic UI's own base class, and CLAUDE.md already
  names it as a known collision. The same package's other renderer was writing
  `aparte-segment` correctly, so the two disagreed with each other.

  | before                    | after                                        |
  | ------------------------- | -------------------------------------------- |
  | `.segment`                | `.aparte-segment`                            |
  | `.seg-qreceipt`           | `.aparte-question-receipt`                   |
  | `.seg-qreceipt-group`     | `.aparte-question-receipt__group`            |
  | `.seg-qreceipt--declined` | `.aparte-question-receipt--declined`         |
  | `.qr-question`            | `.aparte-question-receipt__question`         |
  | `.qr-answer`              | `.aparte-question-receipt__answer`           |
  | `.qr-sep`                 | `.aparte-question-receipt__sep`              |
  | `.qr-declined`            | `.aparte-question-receipt__answer--declined` |
  | `@keyframes qr-appear`    | `@keyframes aparte-question-receipt-appear`  |

  The keyframes name is in the table for the same reason as the classes: animation names live
  in one global namespace too, so `qr-appear` was one `@keyframes` away from a consumer's own.

- 13ec8ca: Every element now carries its own documentation, and the docs site is generated from it.

  `package.json` points `customElements` at `dist/custom-elements.json` and `files` ships `dist`,
  so this file is what feeds a consumer's editor autocomplete — not only apartejs.dev. It was
  thin, wrong in five places, and in one package it did not exist at all.

  ## The manifest, measured across core's 18 elements

  |                                        | before  | after       |
  | -------------------------------------- | ------- | ----------- |
  | descriptions under 200 characters      | 10 / 18 | **0 / 18**  |
  | elements declaring their CSS variables | 0 / 18  | **17 / 18** |
  | declared slots                         | 1       | **0**       |
  | elements carrying a worked example     | 18 / 18 | 18 / 18     |

  **The CSS variables are the substantial half.** 263 exist and not one was attached to the
  element it styles, so they were reachable only through a single flat 263-row reference — present
  and unfindable, which is the failure this repo keeps rediscovering. **177 are now declared on
  their own element**, with the default the stylesheet actually sets. The eighteenth, the composer
  toolbar, correctly declares none: it is styled entirely by global spacing tokens and has no knob
  of its own.

  **The slot count going to zero is the fix, not a regression.** Core has no shadow DOM — no
  `attachShadow`, no `<slot>` element anywhere — so it has no slots. A `@slot` in a manifest
  declares a real slot NAME a consumer can write and tooling will offer; one had shipped for a
  `panel` region that is a plain child stamped `data-aparte-panel`, so an editor would have
  completed a name that does nothing. Ratified decision #4: a name a context contradicts is a name
  that will lie. What an element accepts as children, and where those children land, is now prose.

  ## Five published claims were false, and are corrected rather than softened
  - `<aparte-chat-viewport>`'s `framework-managed` said it "relocates none of its children". It
    re-appends core's own scroll-to-bottom button whenever that stops being last, and that path
    runs in framework-managed mode only. The guarantee is about the nodes the FRAMEWORK renders.
  - `<aparte-chat>` described its composition test as looking for a viewport CHILD. It is a
    descendant query, so a viewport nested inside a wrapper of your own counts — and the
    difference decides whether your markup survives or is overwritten by the default composition.
    Only the centering CSS is direct-child, and only that sentence now says so.
  - `<aparte-chat>` said "a framework wrapper sets `framework-managed`". Only Angular's does: its
    component selector IS `aparte-chat`, while React, Vue and Svelte render a `[data-aparte-chat]`
    div and never create the element.
  - `--aparte-viewport-padding` promised that a narrow container reduces it. That rule targets a
    wrapper the framework-managed path never builds — and it cannot be repaired by adding the
    host, because `container-type` is declared on the viewport itself and a container query never
    matches its own container.
  - `<aparte-composer>`'s `--aparte-message-max-width` said overriding it "moves both". Custom
    properties inherit downward and `.aparte-message` is a sibling subtree, so set on the composer
    it moves only the composer.

  Each was found by an adversarial pass that was told to refute, not to confirm.

  ## `@aparte/plugin-ask-user` ships a manifest for the first time

  It defines a custom element with `customElements.define` and shipped nothing machine-readable
  about it: no `customElements` field, no `analyze` step, no manifest — while its sibling
  `@aparte/plugin-model-selector` has had all three since it shipped. So no editor completed
  `<aparte-ask-user>`'s surface, and no page could be generated from it. It has one now.

  The analyzer plugin that lifts `@example` blocks into a manifest lived inline in core's config,
  so neither plugin element had an example in its own manifest. It is now shared by all three
  configs, and all three report every element carrying one.

  ## Why minor rather than patch

  Nothing's runtime behaviour changed in this entry, but the manifest is a PUBLISHED description
  of the API: a declared slot disappears, 177 CSS custom properties appear, and a package gains a
  `customElements` pointer where it had none. Tooling reads all of that. Calling metadata that
  consumers' editors consume a patch would understate it.

### Patch Changes

- 4b598f7: The question receipt's stylesheet reads core's tokens instead of its own magic
  numbers: spacing on `--aparte-space-*`, its hairline on `--aparte-border-width`, and
  its appear animation on `--aparte-duration-slow`.

  A plugin's CSS lives in a template literal because it cannot edit core's stylesheet —
  but that is a reason to reference the theme's tokens, not to restate their values. The
  receipt now follows a consumer who moves `--aparte-space-unit`, and stops at
  `prefers-reduced-motion` because the duration it reads is overridden there. No API
  change.

- 8759de6: The receipt's last two raw values read the scale: `font-weight: 600` becomes
  `--aparte-font-weight-semibold` and `font-size: 0.8rem` becomes
  `--aparte-font-size-md` (13px against 12.8px, so it moves 0.2px and now sits on a
  step). The previous pass tokenised the receipt's spacing and duration but not its
  type — the weight was still written out, which is how a plugin quietly stops
  following a consumer who restyles the chat.
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

- 0632dd9: `ask-user`'s question receipt is an `.aparte-tag`. It is a pill holding a truncating
  label, which is what that recipe is, and it used to redeclare the whole thing. Its own
  CSS drops from 33 declarations to 22; the card's rule goes from 11 to 6, four of them
  now setting the tag's tokens rather than restating its properties. Nothing moves on
  screen.

  This is also the first place in the repo where a plugin reaches core's recipes, which
  is the point: they are plain classes on a stylesheet core already ships, so a plugin
  needs no import, no client and no build step to use them.

  `model-selector` no longer puts `aparte-model-selector-select` on its `<aparte-select>`.
  It carried no CSS and was queried by nothing. The element is addressable as
  `aparte-model-selector aparte-select`, which is what a consumer restyling it writes.

## 0.12.1

## 0.12.0

## 0.11.0

### Patch Changes

- e40cf78: **Breaking, pre-1.0, no shim:** a request for the human that ends without an answer now **rejects** instead of resolving `{ action: 'cancel' }`.

  `AparteElicitationResult` loses its `cancel` arm and keeps `accept` / `decline`. The failure arrives as the new `AparteElicitationAbortError`, whose `name` is `'AbortError'` — so any handler already testing `err.name === 'AbortError'` needs no change — and whose `reason` is `'aborted'` (a stopped turn, a fired signal, a question taken away by another request) or `'no-presenter'` (nothing was mounted to ask it).

  Why the shape had to change: a value is easy to handle as though it were an answer, and that is exactly what happened one level up. The tool-approval gate read `cancel` as a refusal, stamped the segment `rejected`, and told the model "Tool execution was rejected by the user." The user had pressed Stop. A rejection cannot be mistaken for a decision by a caller that forgot a branch, which is the property `cancel` never had.

  Evidence the shape is right: `askUserHandler` already performed this exact conversion by hand — `{ action: 'cancel' }` in, `new DOMException(..., 'AbortError')` out. That conversion is gone; the error now propagates from the primitive.

  **Migrating.** Replace a `case 'cancel':` branch with a `catch`. A `switch` on `action` that had all three arms keeps compiling with two, and the third path becomes the `catch`. One consequence worth knowing: a request you start and never `await` will surface an unhandled rejection when it ends without an answer, because that is what an ignored failed promise is — attach a `.catch()` if you genuinely do not care about the outcome.

- e406a98: **Every element now declares and describes its own surface**, and the generated API reference prints each event's detail type.

  The manifest is the source of truth for the component API, and it was quietly incomplete. Four elements carried a full `@element` / `@attr` / `@fires` block at the top of their file, separated from the class by imports and interfaces — TypeScript associates only the comment physically adjacent to a declaration, so every authored description was dropped on the floor. Nothing _looked_ missing: the analyser reads `observedAttributes` and `this.dispatchEvent` structurally, so `<aparte-select>` still listed six attributes and three events. They just had no text, and the reference page shipped rows like `| aparte-cancel |  |`.

  Seven event names reached the manifest through neither path and are now declared by hand, because no docblock fix can make them detectable: the analyser's fallback only visits real method declarations and only recognises `this.dispatchEvent`. `<aparte-conversation-list>` had **no events at all** — all four of its dispatches happen in an arrow class field. `<aparte-chat-bubble>` was missing exactly one, `aparte-branch-navigate`, for the same reason. `<aparte-composer>` was missing `aparte-abort` and `aparte-message-aborted`, which go out on `window`.

  Every event that carries a detail now names its type — `@fires {CustomEvent<AparteConversationSelectDetail>} …` — sourced from `event-map.ts`, which is guarded in both directions. Before this, all 26 events in the manifest read as a bare `CustomEvent`; there was no working typed instance in the repo. The generated reference gained a **Type** column to print it, because that is what tells a consumer the shape of `e.detail`.

  Result: 18 elements, every one with a description, every attribute and event described, 26 events of which 20 carry a typed detail.

## 0.10.0

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

- d3e482c: The question panel: right chat, readable schema, replaceable field

  Eleven defects in the elicitation surface — the panel a tool puts up when it has to
  ask the user something. They survived four from-scratch audits for one reason, and it
  is the most useful thing in this release: **no tool ever reached the model, so this
  surface was never executed.** Not badly audited. Never run. Its unit tests pinned the
  shape it had and said nothing about which chat anything belonged to, what the model
  was asked to fill in, or what a screen reader would hear.

  One person with a local model broke it in four places in twenty minutes.

  **Which chat a question belongs to.** `<aparte-elicitation>` could mount its panel in
  ANOTHER chat's composer: it walked up looking for one and fell back to
  `document.querySelector`. Removing that fallback was not enough — the walk itself
  reached `<body>`, where a `querySelector` searches the whole document, so it found
  the other chat's composer by a longer route. The walk now stops at the chat boundary
  and finding nothing cancels with a warning that names the fix. A Stop in one chat also
  cancelled the question another was waiting on, telling that chat's model the user had
  refused something they were still reading — the two `window` listeners had no instance
  filter at all. And in RAW core the composer could not identify itself either (all four
  wrappers set `target`; hand-written markup does not), so one chat's Stop tore down the
  other's open panel while its tool call kept waiting.

  **What the model is asked to fill in.** A question with no options was schema-VALID:
  `options` was neither required nor given a `minItems`, and the 2–6 range lived in the
  system prompt as prose. A local model duly sent two questions with no options, and the
  panel rendered a radio list whose only entry was "Other…" — a text box wearing the
  costume of a choice. `options` is now required with `minItems: 2`, and a model that
  ignores that gets an honest labelled text field instead of an empty `enum`. The
  question text also stopped being the object property KEY: two identically-worded
  questions used to collapse into one field, and the field was labelled only because the
  panel falls back to printing the key. Stable keys now, the text as the field's `title`,
  and a label map so the model still reads "question → answer".

  **Who decides the UX.** `allow_other` is out of the model's schema and becomes
  `setElicitationOptions({ allowOther })` on the config. The model describes the
  question; the host owns the surface. Default `true`, so nothing a user sees changes —
  only who gets to say so. A model still sending it is ignored, so no existing call
  breaks. A field of a schema you build yourself can still set `allowOther`, and it wins.

  **What the user sees.** The composer kept offering the attachment picker through an
  entire elicitation — there is nowhere for a file to go while you are answering a
  question. Declared now with `data-panel-active` + CSS instead of an inline
  `style.display` that clobbered a consumer's own value. Groups of choices are named by
  the question they answer (`role="radiogroup"`/`group` + `aria-labelledby`): a screen
  reader used to announce "Chromium, radio button, 1 of 2" with no question attached.
  Seven strings that were hardcoded English — "Other…", its placeholder and accessible
  name, "Skip", "Yes", "No", "Your answer" — are optional locale keys with per-key
  fallback, plus the French. And the panel's CSS moved out of a JS-injected `<style>`
  into the stylesheet with fifteen `--aparte-elic-*` tokens: it was the one surface that
  could not be themed, its variables were absent from the generated reference, and the
  injection was never re-created if anything removed it.

  **How several questions are asked.** A form of two or more questions put them all in
  one box — a shape inherited from MCP elicitation without being examined. MCP describes
  a form for collecting structured data; asking a person two different questions in the
  middle of a conversation is not that, and no product does it by stacking. Several
  questions are now asked ONE AT A TIME, with a chip per question that is also how you go
  back. Each field takes a short `header` for that chip (the tool schema asks the model
  for two or three words) and falls back to the question's position rather than
  truncating a sentence. The protocol is untouched: the answer is still one object with
  every key, and the composer's send button still means submit. `layout: 'stacked'`
  keeps the form case, which is real — it was just never the right default.

  The composer's one button carries the progression: a chevron while questions remain,
  a check on the last one, and the panel is what knows which. That is why there is no
  "Next" button — the composer already has a button, in a place the user knows, and it
  already changes meaning between sending and stopping. Adding a second row for a Next
  made the panel taller and made it change height when that row went; folding the meaning
  into the existing button removed both problems and the button now says what it does.

  And the escape from the whole request sits in the panel's CORNER, not in a row beside
  the button that advances through the form: adjacency promised "skip this question"
  while it declines everything. Position, not decoration — which is also why the
  reference implementations put theirs in a corner.

  **What a consumer can replace.** `setElicitationFieldRenderer` renders one field while
  the panel keeps everything around it. It returns a control rather than
  `string | HTMLElement` because a field must hand back a value, and the schema
  vocabulary is now a stated contract — three field kinds plus the object form, closed,
  with a test pinning the count so it cannot grow quietly.

  **Migration.** `allow_other` is ignored rather than rejected. The panel's pixels can
  move if you were overriding its rules by selector — that is the trade for being able to
  override them by token. An `<aparte-elicitation>` mounted outside any chat now cancels
  with a warning instead of borrowing the first composer on the page. `AparteLocale`
  gains seven OPTIONAL keys, so an existing locale package keeps compiling and keeps
  rendering English.

  Twenty-six new unit tests and five browser tests — the first browser coverage this
  surface has ever had. Every fix has its sabotage, and one of them refuted a claim of
  mine before it shipped: the new axe scan does NOT catch an unnamed radio group, so the
  comment saying it would is corrected in place and the unit tests are named as the real
  guard.

- c87d2b2: `@aparte/plugin-ask-question` is now `@aparte/plugin-ask-user`, and the tool is `ask_user`

  A rename, decided by looking at what the ecosystem actually calls this rather than at
  what we had called it.

  There are two naming levels and they answer differently. The **protocol** level has a
  standard — MCP calls it _elicitation_ (`elicitation/create`), and ours already matched:
  `requestUserInput`, `AparteElicitation*`, `<aparte-elicitation>`. The **tool** level has
  no formal standard but a clear convention, and it is `ask_user`: Claude Code's
  `AskUserQuestion`, `datasette-agent`'s `ask_user()`, `pi-ask-user`,
  `ask-user-questions-mcp`. `ask_question` was ours alone.

  **What changed**

  - the package: `@aparte/plugin-ask-question` → `@aparte/plugin-ask-user`
  - the tool the model is offered: `ask_question` → `ask_user`
  - the element alias: `<aparte-ask-question>` → `<aparte-ask-user>`, class
    `AparteAskQuestion` → `AparteAskUser`
  - the exports: `askQuestionTool`/`askQuestionHandler`/`setupAskQuestion` →
    `askUserTool`/`askUserHandler`/`setupAskUser`, and
    `AskQuestionOption`/`Item`/`Detail` → `AskUser*`

  **What did NOT change, deliberately.** The receipt keeps its names —
  `questionReceiptRenderer`, `QuestionReceiptSegment`, and the `'question-receipt'`
  segment type. They name the ARTIFACT (a question and the answer it got, kept in the
  transcript), not the tool that produced it, and that segment type is a public string an
  app can emit on its own. Renaming it would break those apps for no gain.

  **Migration.** Change the dependency name, and the four identifiers above. No alias and
  no shim: this library is pre-1.0 and breaks cleanly rather than accumulating two names
  for one thing. The old package name stays on npm at its last published version and will
  receive nothing further — nothing is unpublished, so an existing install keeps working
  until it is updated.

  A model that keeps calling `ask_question` gets no tool by that name, which surfaces as
  an unknown-tool error rather than silence.

## 0.7.1

## 0.7.0

## 0.6.1

## 0.6.0

## 0.5.0-alpha.0

### Patch Changes

- Updated dependencies [cd7adfc]
- Updated dependencies [3edb766]
- Updated dependencies [3b026bb]
  - @aparte/core@0.5.0-alpha.0

## 0.4.0-alpha.0

### Patch Changes

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

### Patch Changes

- 9568c6b: Escape `data-segment-id` in every segment renderer. A segment id can embed an untrusted
  tool-call id (`tool-${toolCallId}`, taken verbatim from the endpoint's SSE `tool_calls[].id`),
  so the tool-call renderer — and, defense-in-depth, all other renderers plus the ask-question
  receipt — now HTML-escape it before it reaches `innerHTML`. Closes a DOM-XSS reachable from a
  hostile OpenAI-compatible endpoint (the same class as the code-fence `language` fix, in a
  sibling sink). Regression test added.
- 71c9167: Packaging fixes surfaced by wiring `publint` + `are-the-types-wrong` into CI:

  - `@aparte/engine`: its emitted `.d.ts` re-exported submodules without `.js`
    extensions, so `node16` / `nodenext` consumers got unresolved types (bundlers
    hid it). Added the extensions — the types now resolve under every module mode.
  - `@aparte/plugin-ask-question`: declared `"sideEffects": true`. Importing the
    package registers `<aparte-ask-question>` as an import-time side effect, which
    a tree-shaking bundler could otherwise legally drop.

- 056dafd: Raise the monorepo TypeScript strictness floor: `noUncheckedIndexedAccess` and
  `noUnusedParameters` move into `tsconfig.base.json`, so every package inherits them (core /
  engine / providers already opted in locally; plugins / wrappers / locales now do too). The
  new floor surfaced — and this fixes — real unchecked index accesses in `model-selector`
  (auto-select + single-provider option list) and `ask-question` (single-question path):
  each now guards the array element instead of assuming it exists.
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
