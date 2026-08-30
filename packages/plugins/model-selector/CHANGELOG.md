# @aparte/plugin-model-selector

## 0.16.3

## 0.16.2

## 0.16.1

## 0.16.0

## 0.15.1

## 0.15.0

## 0.14.0

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

### Patch Changes

- 2ac6080: **Seven behavioural defects from the same audit.**

  **A tool call keeps its state word through a config change.** `relabel` rebuilt the row's badge as the icon alone, so any `setLocale`, `setIconProvider`, `registerTool` or `reset()` deleted the localized word beside it — permanently, because a settled call gets no further `update()`. "Done" went bare and pending's "Running" went empty; four of five statuses regressed. It now goes through `stateBadge`, whose own docblock claims "one function so `render` and `update` cannot disagree" and which `relabel` had never been folded into.

  **Breaking, pre-1.0: the last bare CSS class is prefixed.** The unknown-segment fallback emitted `class="segment aparte-segment-unknown"` — the rename had prefixed the second token and left the first, so 0.11.0's claim that _every_ class core emits is prefixed was false. `.segment` is Semantic UI's base layout class, which is one of the two reasons that rename happened. **If you styled `.segment`, it is `.aparte-segment` now.**

  **Three CSS rules no longer reach out of core.** `[data-status="resolved"] .aparte-tool-state` and its two siblings were the only rules in the stylesheet whose leftmost compound is an unprefixed non-element selector. A host wrapping the chat in `<div data-status="rejected">` re-tinted every completed tool call's word red. Now scoped to `.aparte-segment-tool-call`.

  **Stop in one chat no longer tears down another chat's open question.** The receive side already resolved its own chat host when no `target` attribute is set — which is all of raw core, since the documented markup sets none. The send side read the attribute only, so the abort carried `targetId: undefined`, and a missing id means "for everyone".

  **A number binding with no value no longer writes `"NaN"`.** Angular's `numberAttribute` returns `NaN` for undefined, null, `''` and any non-numeric expression, so `[scrollThreshold]="cfg.threshold"` on an unset field wrote `scroll-threshold="NaN"` — and `parseInt('NaN' || '50', 10)` is NaN because `'NaN'` is truthy, so the transcript stopped following a streaming reply and the scroll-to-bottom button never hid. `applyElementProps` removes the attribute instead, restoring the documented default. `0` still writes, because 0% is a value.

  **A CSS variable with no value is removed rather than stringified.** `props={{ '--aparte-select-bg': theme.selectBg }}` on an optional field set the property to the token `undefined` — worse than leaving it alone, because a property that is _set_ makes every `var(--x, default)` skip its fallback and become invalid at computed-value time, so the declaration is dropped and the control renders unstyled. An object became `[object Object]` the same way.

  **`@aparte/svelte`: five events are bindable again.** The `on:` surface derives from `HTMLElementEventMap`, which deliberately omits the events carrying no detail. Harmless while that only governed `addEventListener` — but declaring the tags removed `SvelteHTMLElements`' catch-all index signature, so `on:aparte-cancel` (the stop button), `on:aparte-composer-submit`, `on:aparte-reset-done`, `on:aparte-select-open` and `on:aparte-select-close` stopped type-checking. All five are Angular `@Output()`s, so the wrappers were not at parity.

  Closed by deriving from core's proxy list as well, which already enumerates every event an element dispatches on itself. `APARTE_DEFAULT_UI_EVENTS` becomes `as const` so the literals exist at the type level, and core exports the new type **`AparteUiEventName`**.

  **`@aparte/plugin-model-selector`: the framework peer ranges are fixed.** `react: "^19.2.7"` and `svelte: "^4.2.0"` were copied from the package's own devDependency pins, excluding React 18 and Svelte 5 — both supported by the matching wrappers. An out-of-range peer that is present is an ERESOLVE conflict whether or not it is optional, so installing this plugin in a Svelte 5 app failed. Now `^18.0.0 || ^19.0.0` and `^4.0.0 || ^5.0.0`, matching the wrappers.

## 0.11.0

### Minor Changes

- 16bcd8a: **`@aparte/plugin-model-selector/angular`** — the fourth and last binding, so all four frameworks now get `<aparte-model-selector>` from the package that owns it.

  ```ts
  import { AparteModelSelectorDirective } from "@aparte/plugin-model-selector/angular";
  // @Component({ imports: [AparteModelSelectorDirective], … })
  ```

  Angular is the only one of the four that needs real code — its template compiler requires a class claiming the selector, and `[persist]="true"` on a custom element writes a _property_, which on an attribute-driven element is a silent no-op. So this entry is compiled in **partial-Ivy** mode by `ngc`, the format a consumer's own AOT build finishes, while Vite keeps building everything else. The directive itself is generated from the package's own custom-elements manifest, like the other three bindings.

  `@angular/core` is an **optional** peer dependency: install the plugin without Angular and nothing here is reachable, which is the point.

  The Angular example now imports this instead of the six-line local directive it wrote while waiting — the import resolving at all _is_ the property, since you get the binding exactly when you have the plugin. That local directive remains the documented path for an element aparté does not define.

- d03b212: **`@aparte/plugin-model-selector` types its own element**, through three new subpath exports: `./react`, `./vue` and `./svelte`.

  ```ts
  import "@aparte/plugin-model-selector/react";
  // <aparte-model-selector persist="" searchable="" placeholder="Pick a model" />  ← typed
  ```

  This is the rule from the previous release made real: whoever owns the element owns its contract and its bindings. `@aparte/angular` briefly shipped a directive for this element and core briefly typed it — both were removed, because a third-party plugin's author cannot add a line to either, so doing it for our own plugin gave aparté's packages a privilege theirs could never have.

  Putting the bindings in the plugin makes the property you actually want fall out of the module graph: **install the package and the tag is typed; don't and it isn't.** TypeScript enforces that, nobody has to remember it.

  Subpaths rather than the main entry because a `declare module 'react'` block only compiles where React's types resolve — in a shared entry it breaks every Vue and Svelte consumer with `TS2664`. `react`, `vue` and `svelte` are **optional** peer dependencies; the three modules carry no runtime at all (0.04 kB each, the augmentation is the whole payload).

  The package now also emits its own custom-elements manifest, and its attribute types are generated from it by the same `scripts/gen-element-bindings.mjs` that generates core's — so the types cannot fall behind the element's JSDoc, and a third-party plugin can run the same tool on its own manifest.

  No Angular subpath yet: an Angular directive is runtime code, so it needs partial-Ivy compilation in a package that builds with Vite. Until then, the six-line local directive the Angular example demonstrates is the path.

### Patch Changes

- e406a98: **Every element now declares and describes its own surface**, and the generated API reference prints each event's detail type.

  The manifest is the source of truth for the component API, and it was quietly incomplete. Four elements carried a full `@element` / `@attr` / `@fires` block at the top of their file, separated from the class by imports and interfaces — TypeScript associates only the comment physically adjacent to a declaration, so every authored description was dropped on the floor. Nothing _looked_ missing: the analyser reads `observedAttributes` and `this.dispatchEvent` structurally, so `<aparte-select>` still listed six attributes and three events. They just had no text, and the reference page shipped rows like `| aparte-cancel |  |`.

  Seven event names reached the manifest through neither path and are now declared by hand, because no docblock fix can make them detectable: the analyser's fallback only visits real method declarations and only recognises `this.dispatchEvent`. `<aparte-conversation-list>` had **no events at all** — all four of its dispatches happen in an arrow class field. `<aparte-chat-bubble>` was missing exactly one, `aparte-branch-navigate`, for the same reason. `<aparte-composer>` was missing `aparte-abort` and `aparte-message-aborted`, which go out on `window`.

  Every event that carries a detail now names its type — `@fires {CustomEvent<AparteConversationSelectDetail>} …` — sourced from `event-map.ts`, which is guarded in both directions. Before this, all 26 events in the manifest read as a bare `CustomEvent`; there was no working typed instance in the repo. The generated reference gained a **Type** column to print it, because that is what tells a consumer the shape of `e.detail`.

  Result: 18 elements, every one with a description, every attribute and event described, 26 events of which 20 carry a typed detail.

## 0.10.0

### Minor Changes

- 0fc38d8: **A live config change now reaches an open question and the model selector.** They were
  the last two components a language switch could not touch, and each was stuck for a
  different reason.

  **The elicitation panel kept no reference to itself.** `Pending` held
  `{ settle, composer }`, so when the locale changed there was nothing to relabel — the
  question a user was looking at stayed in the previous language. Rebuilding was never the
  alternative: the reader may be halfway through typing an answer, or three questions into
  a form.

  So `BuiltElicitationPanel` gains **`relabel()`**, bound by the same rule as a segment
  renderer's: text and attributes only, no node added or removed. The panel collects one
  closure per string it takes from the locale, _while it is being built and only when it
  takes it_ — which is what keeps a `trueLabel` the tool supplied from being overwritten
  by `elicitationYes`. Four sites: the "Other…" option (title, placeholder and accessible
  name), the yes/no labels, and the last-resort answer label. The presenter keeps the panel
  and its Skip button in `Pending`, subscribes with the public
  `subscribeConfigChange`, and re-texts both.

  Asserted in pairs — the strings moved, _and_ a half-typed answer is still there, in the
  same node.

  **Fixed in passing, found by one of those tests:** an elicitation with an empty
  `message` gave its input `aria-label=""` — no accessible name at all. The chain was
  `field.title ?? field.description ?? fallbackLabel ?? t('elicitationAnswerLabel')`, and
  `??` treats `''` as a value, so an empty message won. It is `||` now: an empty title is
  not a name.

  **The model selector was subscribed, and guarded past it.** Its handler returns early
  unless the _model_ config changed, so a language switch reached it and was dropped —
  leaving `modelSelectorPlaceholder`, the one string it takes from the locale and the only
  one visible before the list is opened, in the previous language.

  The guard stays, because it earns its place: a full re-render re-loads every provider's
  models asynchronously and would close an open dropdown and discard a typed search. What
  it gained is a cheap path — one attribute, in place. Measured with a MutationObserver
  rather than claimed: with the fix, a language switch produces exactly one mutation,
  `attr:placeholder`; without it, **zero** — which is the defect, stated as a measurement.
  An explicit `placeholder` attribute still wins, as it does at render time.

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

- 1603015: No tool ever reached the model, and three smaller things a first test session found

  All four of these came out of one person sitting down with the examples and a local
  LM Studio, which found in twenty minutes what four from-scratch audits had not. The
  pattern is worth naming: an audit reads the code, a user runs it.

  **A registered tool was never sent.** `AparteClient` gates the request's `tools`
  array on `getCurrentModel()?.capabilities?.includes('function_calling')`. Three
  facts made that gate permanently closed on the documented primary path:
  `getCurrentModel()` read `provider.getModels()` — the synchronous, hand-declared
  list — which every preset of `@aparte/provider-openai-compat` leaves empty because
  a compat endpoint's list only exists after a `GET /models`; `fetchModels()` never
  wrote its result anywhere the resolver could see; and it declared only
  `['streaming']`. So `getTools()` held the tool the app had registered and
  `tools: []` went on the wire. The model then answered, correctly, that it had no
  such tool — which is exactly what a tester saw, with no error and no warning
  anywhere. The whole tools guide, `needsApproval`, human-in-the-loop approval and
  `@aparte/plugin-ask-user` were inert.

  Three changes, each with the reasoning where it lives. `AparteConfig` caches what
  `refreshProviderModels()` brings back and `getCurrentModel()` consults it before
  the static list. `openai-compat` declares `function_calling`, because a `tools`
  array is a property of the wire format it implements, not a guess about the model —
  `/models` returns `{id, object, owned_by}` and will never say otherwise, so waiting
  for it to declare the capability means never declaring it. And the gate now asks
  whether the model said it CANNOT rather than whether it said it can: a model that
  declares its capabilities and omits function calling is still honoured, but an
  unknown model — the common case — no longer turns an explicit `registerTool` into a
  silent no-op. Over-sending means a model that cannot call a tool does not call one;
  under-sending was silent and total. Two end-to-end tests that had been parked on
  this decision are now running.

  **`requireModelSelection` is enforced by the thing that runs the turn.** It was
  drawn by `aparte-composer` — greying itself, refusing `submit()` — and enforced
  nowhere else, so any other route to an `aparte-send` walked past it: a suggestion
  chip, a "try this prompt" button, a host dispatching the event itself. The turn
  then ran with `config.defaultModel || ''`, an empty model id on the wire. Reported
  from an example, where the chips above the composer stay clickable while the
  composer is visibly greyed out waiting for its model list. The client now refuses
  such a send and says why, because the developer is who can fix it — an app that
  gates should disable its own affordances too.

  **The model selector's dropdown was ordered by a race.** It fetches every
  provider's `/models` in parallel and pushed each result as it arrived, so the order
  — and therefore what `auto-select` lands on — was decided by whichever endpoint
  answered first. A cloud provider on a CDN beats a local server that has to wake up,
  which means an app registering `[local, local, cloud]` could land on the paid one,
  and on a different one after a reload. The list is indexed by registration order
  now: `auto-select` documents itself as "the first model", and first has to mean
  first.

  **And the guide that described the old gate** said tools are sent "only when the
  selected model's `capabilities` include `function_calling`", which was true and is
  the sentence that made the behaviour look intended rather than broken.

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

### Minor Changes

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

### Patch Changes

- 0aefd9b: Escape untrusted model output before it reaches `innerHTML` (two DOM-XSS paths):

  - **core** — the code-segment `language` (the ` ```lang ` fence tag, LLM-authored and
    prompt-injectable) is now HTML-escaped in both the label text and the
    `class="language-…"` attribute; the file-tree node `status` too.
  - **core primitives** — `<aparte-select>` and `<aparte-optgroup>` build their labels via
    `textContent`, not `innerHTML`, matching their own update paths.
  - **plugin-model-selector** — remote model names/ids and provider labels are escaped before
    the option list is (re)built.

  Reachable from a hostile/aggregating `/models` endpoint or a prompt-injected code fence.

- f2d75b0: Fix four teardown/cancellation bugs: the model selector could permanently lock itself out
  of re-rendering if its render threw (now `try/finally`); the Angular Observable to
  async-iterator adapter could hang forever if torn down mid-`await` (its `return()` now
  settles the pending read); and the OpenAI-compat and AI-SDK providers now `cancel()` the
  underlying stream on consumer cancel instead of draining the vendor body to the end (AI-SDK
  also can no longer process a second terminal event).
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
