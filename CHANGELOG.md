# aparté — release notes

Every `@aparte/*` package is released together at one version. Per-package detail
lives in each package's own `CHANGELOG.md`; this file is the aggregate, generated
by `scripts/gen-root-changelog.mjs` (run as part of `pnpm version-packages`).

## 0.9.0

Every `@aparte/*` package ships at this version (they are released in lockstep).

### Minor Changes

- [216c5f0](https://github.com/apartejs/aparte/commit/216c5f0): **A segment now knows where it sits and when it happened.** `AparteSegmentBase`
  gains five optional fields — `messageId`, `index`, `startedAt`, `endedAt`, `meta` —
  so a consumer can build the chrome the market has taught users to expect (a
  collapsed reasoning line with its duration, a tool pill with how long the call
  took) without replacing a renderer. All optional, so nothing existing changes
  shape.

  **Core renders none of it.** It measures the span, because it owns the stream, and
  leaves the display to you: the line reads "Thought for 8s" in one product and
  "8.2s · 1.2k tokens" in another. `meta` is your channel — core never writes there;
  fill it with the `updateSegment(id, { meta })` that already exists. The
  customization guide carries the runnable recipe, and the vanilla example runs it.

  Stamped in one place (`utils/segments.ts`), called by the two owners of a message's
  segment array — the viewport and the framework host. Not by the parser: `tool_call`
  and `pipeline-waiting` segments never pass through it, and its per-turn counter
  would have restarted mid-message on a tool round-trip. `pnpm check:segment-stamp`
  keeps a third writer from appearing.

  `endedAt` is **when content last arrived** — it advances while a segment streams and
  freezes when it settles, so the difference is a live duration during a turn and a
  final one after it. The two simpler rules are both wrong and were both measured:
  closing at the end of the turn makes a reasoning block span the answer that
  followed it (2s of thinking before a 20s reply reads "22s"), and closing when the
  next segment opens counts a ten-second gap as thinking. Only payload counts —
  collapsing a block is presentation, not activity.

  **A segment is now marked finished when the stream says so, not when the turn ends.**
  The parser knew the exact end of every delimited segment — the closing token IS the
  end — and dropped it, so the only signal left downstream was the end of the turn: a
  reader watched "Thinking" for as long as the answer took to stream, and the Markdown
  flush and the highlight-on-settle waited just as long. The parser now marks what it
  closes, at all six sites, and both loops forward that mark instead of content alone.
  Reasoning arriving on its own `reasoning_content` channel has no delimiter, so its
  end in band is the first answer token — both loops say so there too. A duration line
  is therefore readable _while_ the answer streams, which is the whole point of having
  one.

  All five are optional, because they describe a lifecycle rather than a shape: a
  segment built by hand or freshly emitted by the parser has not been inserted yet and
  has no start, and an open segment has no end. `segmentDuration(segment)` reads the
  span so a consumer never subtracts the two fields — the hand-written guard is three
  conditions long and wrong at epoch 0, where a valid timestamp is falsy.

  `isSegmentSettled` is exported alongside them: a tool call settles by its `status`,
  never by `isStreaming`, so a hand-rolled check measures nothing on the segment type
  where a duration matters most.

  Three defects the feature exposed, each fixed:

  - **Nothing ever declared a segment finished.** `completeMessage()` had no callers,
    and the path both agent loops actually take — `updateMessage({ status })` — never
    touched segments. So `isStreaming` was never set to false for a thinking, text or
    code segment anywhere in the model. Both owners now close a finished turn's
    segments through `updateSegment`, which stamps the model _and_ repaints the
    bubble; `error` and `aborted` count as finished, because a stopped stream still
    produced what it produced.
  - **`registerDefaultRenderers()` overwrote a renderer the app had registered**,
    while the lazy `installDefaultRenderersOnce()` documented itself as never
    replacing one. Since `new AparteClient()` calls the eager path, registering a
    custom renderer _before_ constructing your client — the order anyone writes — put
    the built-in silently back. Both paths are now additive.
  - **A code block's copy button copied an empty string** once one more update
    arrived in the turn: it read the segment captured when `setup` ran, and the bubble
    replaces that object on every update. It now reads the rendered source.

  `aparte-terminal-run` gains `messageId`, and its `segmentId` is no longer nullable —
  both come off the segment instead of a DOM attribute, so the event is finally
  resolvable to a turn.
  <sub>`@aparte/core`</sub>

<sub>Version-only bumps (no changes of their own): `@aparte/engine`, `@aparte/provider-ai-sdk`, `@aparte/provider-openai-compat`, `@aparte/provider-transformers`, `@aparte/plugin-ask-user`, `@aparte/plugin-marked`, `@aparte/plugin-model-selector`, `@aparte/plugin-shiki`, `@aparte/plugin-streaming-markdown`, `@aparte/angular`, `@aparte/react`, `@aparte/svelte`, `@aparte/vue`, `@aparte/locale-fr`.</sub>

## 0.8.0

Every `@aparte/*` package ships at this version (they are released in lockstep).

### Minor Changes

- [c33d2b0](https://github.com/apartejs/aparte/commit/c33d2b0): A fourth cold audit: two CRITICALs, fourteen MAJORs, and the guards that let four of them in

  Same protocol as the third — five auditors, no changelog, no git history. It found less
  on the surface and more underneath, which is the only progress worth reporting: the two
  CRITICALs were both in code less than two days old, and four of the MAJORs were defects
  in the guards rather than in the library.

  **The two CRITICALs share a root: `{ config }` scoped what a chat READ and not what it
  ANSWERED.** `AparteClient` listens on `window`, and its only instance filter was
  `scopeToTargetId`; unset, the guard returned `true` for everything. Two config-scoped
  clients on one page therefore both ran a full agentic turn for every send — two provider
  calls, two paid completions, both replies appended into the single target the event
  named. A config-scoped client now declines a target whose boundary resolves a different,
  non-global config; a client on the global config still answers everything, which is every
  single-chat app. The second: opening a conversation revoked its own attachments' object
  URLs, because `clearAll()` releases them and both `setMessages` and `importTree` put the
  messages straight back — and `export()` stores live references, so the two views share the
  very same attachment objects. Every image and file chip was dead on load.

  **Three MAJORs in the turn.** A mid-stream `error` event erased everything already
  rendered: `_handleLifecycleError` replaced the segments instead of appending, so a partial
  answer plus an error became an empty bubble with an error in it. `toolTimeoutMs` could not
  time anything out — all three copies aborted a signal and then awaited the handler with no
  race, and aborting is a request a handler may ignore, which the default shape of a
  consumer tool does. Core's two copies now share `withToolTimeout`. And the engine
  compactor could emit a window opening on `role: 'tool'`, which every OpenAI-compatible
  provider rejects with a 400: compaction turned a long conversation into an unusable one.

  **Consent is scoped to the chat that asked.** Human-in-the-loop approval matched on the
  model-chosen `toolCallId` and nothing else, on a `document` listener, with built-in buttons
  that bubble and compose — so on a page with two chats, a click aimed at one tool could
  satisfy the gate awaiting a different tool in a different conversation. The check is now
  DOM containment: a model can choose an id, it cannot choose where a click happened. A
  programmatic dispatch from a host is still honoured.

  **Three more surfaces where per-instance config did not reach what it configures.**
  `injectRendererStyles()` collected the global's styles over an instance config's, so a
  renderer registered on a config drew unstyled and silently; it now takes the config and
  accumulates rather than assigns, and re-creates its `<style>` when the old one has been
  detached rather than only when it is null. `setupMarkedProvider(options)` scoped the
  provider and not the options — `marked.use()` mutates a module singleton cumulatively, so
  configuring the second chat retroactively changed the first's rendering. And the global
  type augmentations reached the browser entry only, so an SSR consumer silently lost typed
  `e.detail` on every aparté event.

  **Every `AparteChat` accepts a caller-supplied host id.** `scopeToTargetId` matches
  `detail.targetId`, which the wrappers set from an id they generated and neither accepted
  nor exposed — so the documented mechanism was unreachable from three of the four
  components. React, Vue and Svelte gain an optional `id` prop; Angular already honoured
  one. The generated id remains the default.

  **The artifact preview stops overclaiming.** Its comment said everything leaving the frame
  is blocked. The fetch half is true and measured in three engines; the frame navigating
  ITSELF is not a fetch and no directive governs it — `navigate-to` was removed from the
  spec and never shipped. No CSP or sandbox token stops it, so the fix is the claim, plus a
  danger block on `setArtifactPreviewBuilder`, which was one line that never mentioned it
  replaces the policy while recommending CDN libraries.

  **Four MAJORs were the guards.** `check-doc-snippets` compiled with a WEAKER profile than
  the repo compiles itself with — no `noUncheckedIndexedAccess`, `noImplicitReturns`,
  `noFallthroughCasesInSwitch` or `noImplicitOverride` — so a snippet could be certified
  while a reader's build, following this project's own recommended settings, rejected it.
  Aligned, it immediately failed the flagship getting-started example.
  `check-export-mentions` could not read a barrel written as `export *`, saw 4 names for the
  engine's 39-name surface, and then certified the package already at zero unmentioned; it
  also credited a short export whenever a longer documented name merely contained it, and
  its list of barrels omitted the plugins, providers and locale-fr. `check-node-barrel-types`
  diffed export names, which an augmentation module has none of. `check-wrapper-slots` proved
  nothing about the host id. All four now bite, verified by sabotage one at a time, and the
  export guard gained the SEEN floor that a collapsed count needs — the third guard in this
  repo to need it for the same reason.

  **The wrapper reference has examples.** Eleven of the sixteen slot × framework
  combinations appeared in no code block anywhere, in a page whose own history is the reason
  this project has a rule about capabilities cited in passing. The page is generated, so each
  slot now emits one fence per framework from the same table as the syntax column.
  <sub>`@aparte/core`, `@aparte/engine`, `@aparte/plugin-marked`, `@aparte/react`, `@aparte/svelte`, `@aparte/vue`</sub>

- [688a231](https://github.com/apartejs/aparte/commit/688a231): Remediation of a from-scratch audit: four CRITICAL and nineteen MAJOR defects, plus the
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
  <sub>every package</sub>

- [7d6652a](https://github.com/apartejs/aparte/commit/7d6652a): A third cold audit, and the one CRITICAL it found

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
  <sub>`@aparte/core`, `@aparte/engine`, `@aparte/plugin-marked`, `@aparte/plugin-model-selector`, `@aparte/plugin-shiki`, `@aparte/angular`, `@aparte/react`, `@aparte/svelte`, `@aparte/vue`</sub>

- [d3e482c](https://github.com/apartejs/aparte/commit/d3e482c): The question panel: right chat, readable schema, replaceable field

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
  <sub>`@aparte/core`, `@aparte/plugin-ask-user`, `@aparte/locale-fr`</sub>

- [1603015](https://github.com/apartejs/aparte/commit/1603015): No tool ever reached the model, and three smaller things a first test session found

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
  <sub>`@aparte/core`, `@aparte/provider-openai-compat`, `@aparte/plugin-model-selector`</sub>

- [950261d](https://github.com/apartejs/aparte/commit/950261d): The `<artifact>` XML streamer is a file, and its twin no longer disagrees with it

  `@aparte/core` and `@aparte/engine` each carry a hand-maintained copy of the same
  streaming `<artifact>` state machine — core cannot import engine's, because engine
  peer-depends on core. Keeping two copies in step is the whole contract, and until
  now core's half had no name: it was a private method plus a nested block inside a
  2324-line class, so the two files cited each other by **line number**. Four of six
  of those citations had rotted onto unrelated code. `:1658-1669`, sold as "the
  finalize block", was a tool handler's `AbortController`; `:1034-1042`, sold as
  "`_streamLoop`'s leading writes", was `_handleSend` resolving auth. One of the wrong
  ones was published in the API reference.

  Core's half now lives in `client/xml-artifact-feed.ts`, holding both halves the way
  engine's file does — `feedXmlArtifactDelta` and `finalizeXmlArtifact`. It moved
  without a semantic change: it dereferences `this` zero times, because the state it
  mutates was always owned by its caller. Every citation between the two files is now
  a name, and a new gate guard (`check:cross-refs`) refuses a comment that cites code
  by line number at all.

  **Bug fixed, found by the pairing.** A stream that ended on a held partial tag —
  `… <arti`, then nothing — silently dropped those characters. The feeder holds such a
  suffix on purpose (without it, a tag split across deltas loses the artifact's whole
  lifecycle), and engine's `finalize()` has always handed the held text back as chat
  text. Core's finalize only ever handled the `in-artifact` case. Reachable with
  nothing unusual: any truncated reply whose last delta happens to end on `<`, `<a`, …
  `<artifac`.

  No API change: `AparteClient` behaves identically apart from that fix, and the new
  module's exports are not re-exported from the package barrel.
  <sub>`@aparte/core`, `@aparte/engine`</sub>

- [c87d2b2](https://github.com/apartejs/aparte/commit/c87d2b2): `@aparte/plugin-ask-question` is now `@aparte/plugin-ask-user`, and the tool is `ask_user`

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
  <sub>`@aparte/plugin-ask-user`</sub>

### Patch Changes

- [c87d2b2](https://github.com/apartejs/aparte/commit/c87d2b2): `@aparte/plugin-ask-question` is now `@aparte/plugin-ask-user`, and the tool is `ask_user`

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
  <sub>`@aparte/core`</sub>

## 0.7.1

Every `@aparte/*` package ships at this version (they are released in lockstep).

### Patch Changes

- [4a180af](https://github.com/apartejs/aparte/commit/4a180af): The composer no longer sits flush against the bottom edge of the chat.

  Spotted in two live apps: as soon as a conversation started, `center-empty` stopped
  centering the composer and it touched the bottom of the screen. That was an **asymmetry in
  core's own spacing**, not a layout choice — the viewport puts 16px between the last bubble
  and the composer, and there was nothing below it.

  It is core's to fix rather than the app's, because an app cannot express it from outside:
  padding the container also shrinks the scroll area, so the transcript would stop before the
  edge instead of scrolling to it.

  New token, with the same 16px the viewport already uses on its other sides:

  ```css
  /* flush composer — a full-bleed mobile shell with a docked keyboard */
  aparte-chat {
    --aparte-chat-bottom-gap: 0;
  }
  ```

  Visible change: every full-height chat gains 16px under its composer. Applies to the
  vanilla element and to all four wrappers.

  A **patch**, not a minor: this corrects an asymmetry in core's own spacing, and the new
  token is the escape hatch for the correction — a way back to the previous rendering — not
  a capability anyone asked for.
  <sub>`@aparte/core`</sub>

<sub>Version-only bumps (no changes of their own): `@aparte/engine`, `@aparte/provider-ai-sdk`, `@aparte/provider-openai-compat`, `@aparte/provider-transformers`, `@aparte/plugin-ask-user`, `@aparte/plugin-marked`, `@aparte/plugin-model-selector`, `@aparte/plugin-shiki`, `@aparte/plugin-streaming-markdown`, `@aparte/angular`, `@aparte/react`, `@aparte/svelte`, `@aparte/vue`, `@aparte/locale-fr`.</sub>

## 0.7.0

Every `@aparte/*` package ships at this version (they are released in lockstep).

### Minor Changes

- [acb1e37](https://github.com/apartejs/aparte/commit/acb1e37): **Breaking:** the composer's three positional footer slots become one `toolbar`.

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
  <sub>`@aparte/core`, `@aparte/angular`, `@aparte/react`, `@aparte/svelte`, `@aparte/vue`</sub>

<sub>Version-only bumps (no changes of their own): `@aparte/engine`, `@aparte/provider-ai-sdk`, `@aparte/provider-openai-compat`, `@aparte/provider-transformers`, `@aparte/plugin-ask-user`, `@aparte/plugin-marked`, `@aparte/plugin-model-selector`, `@aparte/plugin-shiki`, `@aparte/plugin-streaming-markdown`, `@aparte/locale-fr`.</sub>

## 0.6.1

Every `@aparte/*` package ships at this version (they are released in lockstep).

### Patch Changes

- [2075f9b](https://github.com/apartejs/aparte/commit/2075f9b): README fix: the npm page announced "🚧 **Pre-alpha** — not yet published to npm" —
  false on the very page npm was serving, and it had been through four releases. It now
  states what the package is (alpha, plain `0.x`, lockstep, API can still change) and
  links the changelog.

  The quick start went with it: it showed `registerDefaultRenderers()` as a required
  step (the built-ins install themselves since 0.5.0-alpha.0) and stopped before the one
  line that makes the retry/edit buttons appear now that they ship off. It also pointed
  at the docs _sources_ in the monorepo rather than at apartejs.dev.
  <sub>`@aparte/core`</sub>

- [0c4c0e3](https://github.com/apartejs/aparte/commit/0c4c0e3): **Fix: a locale switch now reaches the components already on screen.** The docs say
  it plainly — "a locale switch is live: mounted components re-render immediately" — and
  `setLocale()` does notify. The components honoured only part of it, so switching
  language left a **bilingual** interface until a reload rebuilt the elements:

  - a **bubble** rebuilt its action-bar labels but kept its old name (`You` /
    `Assistant`), its avatar initial, the `aria-label` of the `‹ ›` branch arrows and of
    the action toolbar, and the waiting indicator's screen-reader label;
  - a **viewport** applied `locale.direction` once at render, so a chat already mounted
    never flipped to **RTL**;
  - a **conversation list** kept its previous-language row labels (the delete/archive
    buttons, and the fallback title of an untitled conversation) until something else
    happened to re-render it.

  All three now refresh on the config change, keeping the existing precedences: an
  explicit `name` attribute still outranks the locale, and an instance-scoped config
  change never touches a component resolving to another config.
  <sub>`@aparte/core`</sub>

- [6e0211c](https://github.com/apartejs/aparte/commit/6e0211c): **Fix: refreshing a live option list no longer throws away the keyboard position.**

  `aparte-select` keeps its roving highlight as a `data-active` attribute on an option
  ELEMENT, so replacing the options of an open dropdown took it away — while the
  component still believed it held a position. Consequences, all silent:

  - the visible highlight disappeared mid-navigation;
  - `aria-activedescendant` on the trigger kept pointing at an id no longer in the
    document — a broken reference for a screen reader;
  - the next arrow key moved from the stale index.

  Worse, nothing noticed: a consumer refreshing a list writes into
  `.aparte-select-options`, a **descendant**, and the observer watched only its own
  children. It now watches the subtree and re-asserts the highlight on the new elements,
  clamped to the new length, and only when the dropdown was already open with a position
  held — a refresh never invents one, and navigation resumes where the user was rather
  than jumping back to the top.

  Found via three CI-only e2e flakes (a keyboard-navigation assertion polling ten seconds
  for a highlight that a concurrent refresh had erased). `@aparte/plugin-model-selector`
  is the in-repo consumer that triggers it, whenever the provider list settles.
  <sub>`@aparte/core`</sub>

<sub>Version-only bumps (no changes of their own): `@aparte/engine`, `@aparte/provider-ai-sdk`, `@aparte/provider-openai-compat`, `@aparte/provider-transformers`, `@aparte/plugin-ask-user`, `@aparte/plugin-marked`, `@aparte/plugin-model-selector`, `@aparte/plugin-shiki`, `@aparte/plugin-streaming-markdown`, `@aparte/angular`, `@aparte/react`, `@aparte/svelte`, `@aparte/vue`, `@aparte/locale-fr`.</sub>

## 0.6.0

Every `@aparte/*` package ships at this version (they are released in lockstep).

### Minor Changes

- [583840f](https://github.com/apartejs/aparte/commit/583840f): **New entry point `@aparte/plugin-shiki/core`, for control over what you ship.**

  The convenience entry imports `shiki`, whose bundle maps every known language to a
  dynamic import — so a bundler emits one chunk per grammar. Measured on a build whose
  only import was `setupShikiProvider`: **302 files, 11 MB** (`emacs-lisp` alone is
  780 kB, plus `wasm`, `wolfram`, `vue-vine`… for a chat that will show twenty
  languages). The same build against a highlighter carrying three grammars: **1 file,
  560 kB**.

  No runtime option can fix that — verified rather than assumed: restricting shiki's
  `langs` still emitted all 302 files, because a static import is a static import. So
  the fix is an entry point that never imports the bundle:

  ```ts
  import { createHighlighterCore } from "shiki/core";
  import { createJavaScriptRegexEngine } from "shiki/engine/javascript";
  import ts from "@shikijs/langs/typescript";
  import githubDark from "@shikijs/themes/github-dark";
  import { setupShikiProviderFromHighlighter } from "@aparte/plugin-shiki/core";

  setupShikiProviderFromHighlighter(
    await createHighlighterCore({
      themes: [githubDark],
      langs: [ts],
      engine: createJavaScriptRegexEngine(),
    }),
  );
  ```

  `@aparte/plugin-shiki/core` imports nothing from `shiki` at runtime (types only, and
  those are erased). The trade is stated where you make it: your highlighter's grammars
  are fixed, so a language it does not carry renders as plain text — there is no
  on-demand load to fall back on. Everything else matches the convenience entry,
  plaintext aliases and case-insensitive matching included.

  Nothing is removed and no default changes: `setupShikiProvider` behaves exactly as
  before. Its JSDoc — and the plugin's docs page — stop implying that lazy loading also
  means a small package: "you pay only for the languages you render" was true of
  _runtime_, never of _distribution_.
  <sub>`@aparte/plugin-shiki`</sub>

<sub>Version-only bumps (no changes of their own): `@aparte/core`, `@aparte/engine`, `@aparte/provider-ai-sdk`, `@aparte/provider-openai-compat`, `@aparte/provider-transformers`, `@aparte/plugin-ask-user`, `@aparte/plugin-marked`, `@aparte/plugin-model-selector`, `@aparte/plugin-streaming-markdown`, `@aparte/angular`, `@aparte/react`, `@aparte/svelte`, `@aparte/vue`, `@aparte/locale-fr`.</sub>

## 0.5.0-alpha.0

Every `@aparte/*` package ships at this version (they are released in lockstep).

### Minor Changes

- [cd7adfc](https://github.com/apartejs/aparte/commit/cd7adfc): **Only the affordances core can honour end-to-end are enabled by default.** A button
  that answers to nobody is worse than a missing feature — the user clicks it and
  concludes the app is broken. Six controls were in that state, and the proof it had
  gone unnoticed is that not one of our own six playgrounds handled
  `aparte-message-info`, `aparte-attachment-preview` or `aparte-terminal-run`.

  Core copies text on its own, so `copy` stays on. Everything else now waits for the
  app to say it is there:

  | Control                         | Needs                          | Was                     | Now |
  | ------------------------------- | ------------------------------ | ----------------------- | --- |
  | `retry`                         | a host that re-sends           | on                      | off |
  | `edit`                          | a host that keeps the new text | on                      | off |
  | `info` (ⓘ)                      | your stats popover             | on, **and unremovable** | off |
  | image-tile preview              | your lightbox                  | always                  | off |
  | terminal `Run`                  | your executor                  | always                  | off |
  | download on a _binary_ artifact | your file generator            | always                  | off |

  Edit was the worst of them: it opened, accepted text, saved — and the original text
  came back, because replacing it is the client's job.

  **Migration** — if you run `AparteClient` (or handle the events yourself), one line
  restores the action bar you had:

  ```ts
  AparteConfig.setBubbleActions({ retry: true, edit: true });
  ```

  and for the three affordances outside the bar, declare what you handle:

  ```ts
  AparteConfig.setHostHandlers({
    attachmentPreview: true,
    terminalRun: true,
    artifactRedownload: true,
  });
  ```

  No event and no API was removed — core just stops offering what nobody answers. Also
  in this release:

  - **`info` is a bubble action like the others.** It was pushed at the tail of the flag
    branch: impossible to turn off, and impossible to request in an explicit per-role
    list (`'info'` was not an `AparteBubbleActionName`). Both directions work now.
  - **A declared image tile is a real button** — `role="button"`, a tab stop and
    Enter/Space — instead of a `<div>` with a click listener. Undeclared, it carries no
    role and no pointer cursor: half-signalling is the same lie in a quieter voice.
  - **An empty action bar is no longer rendered.** With every action off it stayed as a
    `role="toolbar"` holding nothing and still reserved 28px under every bubble. The
    bar and the footer now follow their contents (a branch picker alone still gets its
    row).
  - New exports: `setHostHandlers` / `getHostHandlers`, `DEFAULT_BUBBLE_ACTIONS`,
    `DEFAULT_HOST_HANDLERS` — read the defaults instead of hard-coding them.

  Untouched on purpose: `copy` on a terminal segment, download on a **text** artifact,
  the `‹1/2›` branch picker, the waiting indicator, the stop button and the model
  selector — core honours all of those itself.
  <sub>`@aparte/core`</sub>

- [3edb766](https://github.com/apartejs/aparte/commit/3edb766): **The built-in segment renderers install themselves the first time a segment needs
  one.** `registerDefaultRenderers()` had exactly one caller: `new AparteClient()` —
  the object the _bring your own loop_ guide tells you not to construct. A
  display-only app therefore rendered `[Unknown segment type: text]` for every reply,
  with working bubbles, working streaming and working scroll, so the only thing missing
  was the content and it read as a bug in the consumer's own loop. The _bring your own loop_ guide never
  mentioned the call either — it was documented as **required** on the Getting-started
  page (and in both READMEs), so this was one path missing a note, not an undocumented
  API. But a required call whose only correct answer is always "yes, call it" is
  ceremony, not a decision: nobody wants `text` segments rendering as
  `[Unknown segment type: text]`.

  The sweep is **strictly additive**: a renderer you registered yourself is never
  replaced, so a custom `text` renderer survives the install a `code` segment triggers.
  `registerDefaultRenderers()` still works and is still what the examples do — it is
  simply no longer the difference between a chat that renders and one that doesn't.

  `AparteClient({ autoRegister: false })` still means what it says: declining is
  remembered, so nothing installs the built-ins later. Do it at startup, before the
  first segment renders.

  The unknown-type warning now names the fix for the case that remains (a type core has
  never heard of) instead of pointing at a call you no longer need.
  <sub>`@aparte/core`</sub>

### Patch Changes

- [3b026bb](https://github.com/apartejs/aparte/commit/3b026bb): **Fix: streaming a segment with `appendToSegment` wrote every chunk twice** — in the
  message model and on screen ("BonjourBonjour le le monde"), which shows up as a word
  appearing twice as the reply streams in.

  One object, two writers. `addSegment` hands the **same segment object** to the
  message model and to the bubble, and `appendToSegment` then advances it from both
  ends: the viewport appended the chunk in place, and the bubble — holding that very
  object — appended it again. On the framework-managed path a third writer joined in,
  the coalesced once-per-frame state sync, which added the chunk on top of content
  that already had it.

  Both sides now own the value they advance: the viewport **replaces** the segment
  instead of mutating it, and the per-frame sync writes an **absolute** target
  (captured before the paint) rather than a delta. Same two writes, same single
  render per frame — no shared mutable state between them.

  Why no test caught it: `AparteClient` never calls `appendToSegment`. It writes
  segment text with `updateSegment` (absolute content), so every path our own examples
  and browser suite exercise went around this one — `appendToSegment` is the API a
  caller driving its own loop uses. Its only unit coverage ran against a _mocked_
  viewport, and a paint that writes nothing cannot double-count. The regression tests
  added here drive the real viewport and the real bubble, on both the raw-core and the
  framework-managed path, and assert exact text rather than a substring — the weakness
  that also let the browser suite stay green.
  <sub>`@aparte/core`</sub>

<sub>Version-only bumps (no changes of their own): `@aparte/engine`, `@aparte/provider-ai-sdk`, `@aparte/provider-openai-compat`, `@aparte/provider-transformers`, `@aparte/plugin-ask-user`, `@aparte/plugin-marked`, `@aparte/plugin-model-selector`, `@aparte/plugin-shiki`, `@aparte/plugin-streaming-markdown`, `@aparte/angular`, `@aparte/react`, `@aparte/svelte`, `@aparte/vue`, `@aparte/locale-fr`.</sub>

## 0.4.0-alpha.0

Every `@aparte/*` package ships at this version (they are released in lockstep).

### Minor Changes

- [50d90a8](https://github.com/apartejs/aparte/commit/50d90a8): **The waiting state now exists.** Between "user sends" and the first token there was a bubble
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
  <sub>`@aparte/core`</sub>

- [cda5f54](https://github.com/apartejs/aparte/commit/cda5f54): `<aparte-chat>` gained an **`attachments`** attribute: it adds the file picker
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
  <sub>`@aparte/core`</sub>

- [e9909c6](https://github.com/apartejs/aparte/commit/e9909c6): New exported helper `filesToAttachments(files)`: turns the `File[]` an
  `aparte-send` event carries into the `AparteAttachment[]` a bubble renders (id,
  MIME type, object URL, and the raw `File` kept for storage adapters).

  This conversion already existed inside `ConversationController`, so framework
  wrappers had it — but a raw-core consumer driving `appendMessage()` itself had to
  hand-roll object URLs, and silently rendered attachment-less bubbles if it
  didn't (the vanilla playground did exactly that). The controller now uses the
  same helper, so there is one implementation.
  <sub>`@aparte/core`</sub>

- [fcacade](https://github.com/apartejs/aparte/commit/fcacade): `runStreamAgent` gained an optional **`onHistoryAppend`** hook: it reports every turn the loop
  appends to the history — the grouped `tool_call` envelope, each `tool_result` (resolved or
  rejected), and a pipeline phase's reply — in order, and always before the transport call that
  would carry it. Messages you passed in `baseRequest` are never reported: you already have them.

  This makes the loop usable by hosts that **own their own transcript**. It re-sends its message
  array every turn, which fits a stateless message API but not a prefix cache (llama.cpp slots,
  vLLM), where turn N+1 must _extend_ turn N byte for byte. Such a host already controlled the
  request — `transportCall` may ignore `request.messages` — but had to reimplement the loop's
  tool_call/tool_result bookkeeping to keep its own log in sync. Now it just mirrors the
  notifications.

  No core change is needed to use it through the `streamRunner` seam:
  `streamRunner: (opts) => runStreamAgent({ ...opts, onHistoryAppend })`. Omitting the hook leaves
  behaviour byte-identical — pinned by a test that compares the event stream and the per-turn
  requests with and without it.
  <sub>`@aparte/engine`</sub>

- [0aa386e](https://github.com/apartejs/aparte/commit/0aa386e): **Behavior change:** the default composer shell no longer mounts the file picker. All four
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
  <sub>`@aparte/angular`, `@aparte/react`, `@aparte/svelte`, `@aparte/vue`</sub>

### Patch Changes

- [358bc53](https://github.com/apartejs/aparte/commit/358bc53): `appendToSegment` no longer costs a full framework render per token. It used to
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
  <sub>`@aparte/core`</sub>

- [801622a](https://github.com/apartejs/aparte/commit/801622a): Swapping a branch no longer conjures a scroll-to-bottom button on a transcript you are
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
  <sub>`@aparte/core`</sub>

- [0d4945f](https://github.com/apartejs/aparte/commit/0d4945f): Two attachment-rendering fixes in the message bubble:

  - **Alignment**: a user message's attachment strip was anchored to the trailing
    edge while the user bubble hugs its text on the leading edge — one message
    split across both sides of the transcript (a chip on the right, the text
    bubble on the left). The strip now shares the bubble's edge.
  - **Standalone `appendMessage()`**: the viewport created the bubble from
    attributes only, silently dropping the message's `attachments`, `segments`
    and `usage`. It now runs the same `populateBubbleFromMessage` sync the
    framework-managed path uses, so an imperatively appended message renders in
    full (bring-your-own-loop consumers were getting text-only bubbles).
  <sub>`@aparte/core`</sub>

- [de57a6a](https://github.com/apartejs/aparte/commit/de57a6a): Fix a pending assistant bubble showing its action bar (copy/retry) and no busy
  state in every framework wrapper. A wrapper creates `<aparte-chat-bubble>` with
  its attributes already set, so `streaming` arrived _before_ the element rendered
  its inner DOM — and `_updateStreaming()` had no `.aparte-message` to write to, so
  `data-streaming`, `aria-busy="true"` and the class that hides the footer were
  silently dropped for the whole turn. The state is now re-applied when the inner
  DOM is built.

  Visible effect: an empty, still-streaming reply no longer offers Copy/Retry, and
  screen readers get `aria-busy` while the answer is being generated.
  <sub>`@aparte/core`</sub>

- [af5ed3d](https://github.com/apartejs/aparte/commit/af5ed3d): `@aparte/core` now declares `sideEffects` (it was the only one of the 14 packages
  without it, so bundlers had to treat every module as side-effectful and could not
  tree-shake it). The browser entry and the CSS are listed as effectful — they define
  the custom elements — and everything else, including the DOM-free Node entry, is
  pure.

  The README gains a **Node / SSR** section: the `node` export condition, what the
  server entry keeps (client, host, transports, `createAparteChatHandler`, runtime,
  types) and what it drops (the custom elements, with `registerAllComponents()` a safe
  no-op). The capability already existed and was invisible — reading `src/index.ts`
  shows the _browser_ entry, which is how a consumer concludes the opposite.
  <sub>`@aparte/core`</sub>

- [2336bc5](https://github.com/apartejs/aparte/commit/2336bc5): A partial `AparteIconProvider` no longer breaks the bubble action bar. `getIcon()`
  always fell back to the built-in SVGs for icons a provider didn't implement, but
  `getIconProvider()` — what the action bar reads, calling each icon directly —
  handed back the registered provider verbatim, so a provider covering only some
  icons threw `icons.retry is not a function`. It now returns a complete set,
  falling back per icon.

  Consequently every key on `AparteIconProvider` is now optional, which is what the
  runtime always supported (and what the interface's own example showed). Full
  providers keep type-checking unchanged; partial ones stop needing `as any`.
  <sub>`@aparte/core`</sub>

- [79b2795](https://github.com/apartejs/aparte/commit/79b2795): Accessibility fixes in `<aparte-select>` (and therefore the model selector), all
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
  <sub>`@aparte/core`</sub>

- [9f839e4](https://github.com/apartejs/aparte/commit/9f839e4): Fix send routing when several chats share a page. `AparteClient._handleSend`
  resolved the event's `targetId` by requiring `appendMessage` **on** that element,
  but an `<aparte-chat>` shell owns no `appendMessage` — it delegates to its
  `.viewport`. Every `target`-attributed send therefore logged a warning and fell
  through to a DOM scan that returns the _first_ chat on the page, so with two
  chats mounted one chat's reply rendered inside the other. Send now uses the same
  resolver as retry/edit (which had already been fixed for this).
  <sub>`@aparte/core`</sub>

- [80995ea](https://github.com/apartejs/aparte/commit/80995ea): `injectTokenStream` / `streamTokens` now keep the framework's message list in sync. They
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
  <sub>`@aparte/core`</sub>

- [118d4fb](https://github.com/apartejs/aparte/commit/118d4fb): Editing a message now updates the bubble that shows it. `AparteChatViewport`
  forwarded an atomic `updateMessage()` to the rendered bubble only when the
  payload carried `status` or `segments`, so an edit — which sends `{ content }` —
  updated the message repo (and therefore the history sent to the model) while the
  transcript kept displaying the old wording. `content`, `attachments` and `usage`
  updates are forwarded too now.

  Standalone/raw-core consumers were affected; framework wrappers re-render bubbles
  from their own state, which masked it.
  <sub>`@aparte/core`</sub>

- [8286e3f](https://github.com/apartejs/aparte/commit/8286e3f): Two provider contracts now say what they actually do.

  `createOpenAICompatProvider` returns `AparteAIProvider & AparteFormatAdapter`. The
  factory has always supplied `buildRequest` / `parseStream` / `authHeaders` /
  `defaultEndpoint`, but the declared type left them optional (right for
  `AparteAIProvider` in general, since a provider may own its I/O through `chat()`) —
  so callers driving the adapter themselves had to add `!` or write a check that
  cannot fail.

  `@aparte/provider-transformers` warns once when it drops `tool_call` / `tool_result`
  turns from the prompt. Tool calling is out of scope for v1, but the turns were
  filtered silently: an app with registered tools got a model that never saw the call
  or its result, with nothing to explain it.
  <sub>`@aparte/provider-openai-compat`, `@aparte/provider-transformers`</sub>

- [bebc201](https://github.com/apartejs/aparte/commit/bebc201): Usage is no longer lost on a turn that ends with a tool call. `parseStream` emitted
  `done` and returned as soon as it saw `finish_reason: 'tool_calls'` — but under
  `include_usage` (which `buildRequest` requests) the usage-only chunk arrives _after_
  the finish chunk, so `done.usage` was `undefined` for every tool-call turn. On a chat
  that goes unnoticed; on an agent it is most turns. The parser now emits the
  `tool_use` events and keeps reading, so the single `done` carries the usage (including
  `cacheReadTokens`).
  <sub>`@aparte/provider-openai-compat`</sub>

- [50d90a8](https://github.com/apartejs/aparte/commit/50d90a8): **The waiting state now exists.** Between "user sends" and the first token there was a bubble
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
  <sub>`@aparte/angular`, `@aparte/react`, `@aparte/svelte`, `@aparte/vue`</sub>

- [73ecd4e](https://github.com/apartejs/aparte/commit/73ecd4e): Fix the `aparte-*` JSX types under **React 19**. The wrapper declared its custom
  elements only in the legacy _global_ `JSX` namespace, which React 19 no longer
  consults (`React.JSX` replaced it) — so any React 19 consumer writing
  `<aparte-composer-input />` (for instance to slot a custom composer) got
  `TS2339: Property 'aparte-composer-input' does not exist on type
'JSX.IntrinsicElements'`, despite the peer range advertising `^18 || ^19`. The
  element list is now declared once and merged into both namespaces, so React 18
  and 19 consumers both see it.

  The blind spot is closed too: the package is developed against `@types/react` 19
  (its own JSX would fail to compile without the augmentation), and the React
  playground's typecheck — now part of the gate — covers the consumer-side case.
  <sub>`@aparte/react`</sub>

<sub>Version-only bumps (no changes of their own): `@aparte/provider-ai-sdk`, `@aparte/plugin-ask-user`, `@aparte/plugin-marked`, `@aparte/plugin-model-selector`, `@aparte/plugin-shiki`, `@aparte/plugin-streaming-markdown`, `@aparte/locale-fr`.</sub>

## 0.3.0-alpha.0

Every `@aparte/*` package ships at this version (they are released in lockstep).

### Minor Changes

- [d4c448b](https://github.com/apartejs/aparte/commit/d4c448b): New `fileInjectFilter` on `AparteClientOptions`: a per-file veto on top of the
  `rawFileInject` mode. Called for each attached file the mode would inline into
  the request; return `false` to keep it out (the file still rides on the
  `aparte-send` event for the application layer). Lets a host keep the default
  inline UX while blocking sensitive names (`.env`, keys, certs).
  <sub>`@aparte/core`</sub>

- [7227dee](https://github.com/apartejs/aparte/commit/7227dee): New `AparteConfig.resetLocale()`: restores the built-in English locale after a
  `setLocale(...)` call, without having to import `DEFAULT_LOCALE` yourself.
  Notifies mounted components like every other live setter.
  <sub>`@aparte/core`</sub>

- [7227dee](https://github.com/apartejs/aparte/commit/7227dee): `AparteAIProvider.getModels()` is now typed **synchronous-only** (`AparteAIModel[]`).
  The `Promise<AparteAIModel[]>` form was silently ignored by `getCurrentModel()`: an
  async provider lost its capability list (e.g. `function_calling`), which disabled
  tools with no error or warning. Async model fetching belongs in `fetchModels()`
  (consumed by `AparteConfig.refreshProviderModels()` and the model-selector).
  Plain-JS consumers that still return a Promise now get an explicit `console.warn`
  instead of a silent failure. All bundled providers already complied.
  <sub>`@aparte/core`</sub>

### Patch Changes

- [0192d63](https://github.com/apartejs/aparte/commit/0192d63): `injectTokenStream` / `stopTokenStream` now carry real JSDoc on the canonical
  `AparteChatImperativeApi` (shipped in the `.d.ts`, so it surfaces in every
  wrapper): the viewport auto-creates a missing assistant message internally
  only, so wrappers should `appendMessage` explicitly before injecting. A new
  "Bring your own loop" docs guide covers the display-only mode end to end.
  <sub>`@aparte/core`</sub>

- [622dc78](https://github.com/apartejs/aparte/commit/622dc78): `<aparte-select>`'s combobox trigger now carries an accessible name (axe
  `aria-input-field-name`, serious): the host's `aria-label` when provided,
  falling back to the `placeholder`. Screen readers previously announced the
  model selector as an unnamed combobox.
  <sub>`@aparte/core`</sub>

<sub>Version-only bumps (no changes of their own): `@aparte/engine`, `@aparte/provider-ai-sdk`, `@aparte/provider-openai-compat`, `@aparte/provider-transformers`, `@aparte/plugin-ask-user`, `@aparte/plugin-marked`, `@aparte/plugin-model-selector`, `@aparte/plugin-shiki`, `@aparte/plugin-streaming-markdown`, `@aparte/angular`, `@aparte/react`, `@aparte/svelte`, `@aparte/vue`, `@aparte/locale-fr`.</sub>

## 0.2.0-alpha.0

Every `@aparte/*` package ships at this version (they are released in lockstep).

### Minor Changes

- [930a108](https://github.com/apartejs/aparte/commit/930a108): Harden the server-side `createAparteChatHandler`: add an optional `authorize(req)` gate
  that runs before any work (return `false` for a 401, a `Response` for a custom rejection,
  or `true` to proceed) so you can put auth in front of the key-spending `/api/chat` route,
  and guard the vendor URL build against an adapter returning a non-rooted request path
  (SSRF) by rejecting anything that isn't a single-rooted path.
  <sub>`@aparte/core`</sub>

- [4aac26d](https://github.com/apartejs/aparte/commit/4aac26d): Add the `<aparte-chat>` shell — the container element for a chat. Wrap a viewport
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
  <sub>`@aparte/core`</sub>

- [a2ed74b](https://github.com/apartejs/aparte/commit/a2ed74b): Ship clean inline-SVG default icons (copy, retry, edit, send, thumbs up/down, and
  the rest) in `DEFAULT_ICON_FALLBACKS`, so the chat looks right out of the box with
  no icon plugin — still zero runtime dependencies, since an inline SVG is just a
  string. Override any icon via `setIconProvider` with any HTML (SVG, an icon-font
  `<i>`, an emoji or an `<img>` — the value is treated as trusted markup).
  <sub>`@aparte/core`</sub>

- [a6ed936](https://github.com/apartejs/aparte/commit/a6ed936): One canonical imperative contract for `<AparteChat>` across the four wrappers.

  `@aparte/core` now exports `AparteChatImperativeApi` — the ~20-method surface every
  framework handle delegates to `AparteChatHost`. React's `AparteChatHandle` and
  Vue/Svelte's `AparteChatInstance` are now type aliases of it, and the Angular
  component `implements` it, so any per-wrapper drift (a missing or mistyped method)
  is a **compile error** instead of a silent divergence.

  **Angular parity:** adds the imperative `setConversationId(id)` method (the
  `conversationId` `@Input` remains the declarative path), closing the one gap where
  Angular's handle differed from the other three.
  <sub>`@aparte/core`, `@aparte/angular`</sub>

- [7157ad5](https://github.com/apartejs/aparte/commit/7157ad5): Unify every custom DOM event to one kebab-case convention and type it.

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
  <sub>`@aparte/core`, `@aparte/plugin-model-selector`, `@aparte/angular`, `@aparte/react`, `@aparte/svelte`, `@aparte/vue`</sub>

- [69525ad](https://github.com/apartejs/aparte/commit/69525ad): Zero-dependency web components for AI chat: bubble, composer, viewport,
  conversation list, and elicitation, with a transport seam (`DirectTransport` /
  `BackendTransport`) and a customization surface (render hooks, action registry,
  theming via CSS custom properties). Ships ESM plus a Node/SSR-safe entry and a
  custom-elements manifest.
  <sub>`@aparte/core`</sub>

- [d31f681](https://github.com/apartejs/aparte/commit/d31f681): Give the base chat container layout to both host shapes core already recognises,
  from one rule. Core resolves the chat host via the selector
  `aparte-chat, [data-aparte-chat]` (the vanilla `<aparte-chat>` element and the
  `<div data-aparte-chat>` roots the framework wrappers render); the base
  flex-column layout (fill the parent, viewport scrolls internally, composer pinned
  to the bottom) now keys on that same selector in `aparte.css`. This fixes React,
  whose wrapper container previously had no base layout, and lets the Vue and Svelte
  wrappers drop their scoped component CSS — every wrapper gets consistent layout
  from the one stylesheet consumers already import, with no wrapper-specific class.
  <sub>`@aparte/core`</sub>

- [e69435f](https://github.com/apartejs/aparte/commit/e69435f): Make the `<aparte-chat>` shell framework-safe: it no longer injects its default
  viewport + composer when the element carries `framework-managed`. A framework
  wrapper whose component selector is `aparte-chat` (the Angular one) has its host
  upgraded by core, and its children only render _after_ `connectedCallback` — so
  the existing "author-provided composition wins" check cannot see them, and the
  default composition was being injected underneath the wrapper's own. Reuses the
  same `framework-managed` signal `<aparte-chat-viewport>` already takes.
  <sub>`@aparte/core`</sub>

- [bfa9901](https://github.com/apartejs/aparte/commit/bfa9901): Theme every part of the chat from CSS. The message surface is now a
  `.aparte-message-content` region (attachments sit above it as a sibling, the
  avatar is opt-in — empty by default), and every theme value flows through a CSS
  custom property: colour, spacing, font size / weight / line-height, control
  sizes, radii and border widths. No hardcoded theme literals remain — only
  structural geometry (`100%`, `50%` radii, the spinner stroke). New scales:
  `--aparte-space-*`, `--aparte-font-size-*`, `--aparte-font-weight-*`,
  `--aparte-line-height-*`.

  BREAKING: the `--aparte-bubble-*` theme variables are renamed to
  `--aparte-message-content-*`.
  <sub>`@aparte/core`</sub>

- [554e4e9](https://github.com/apartejs/aparte/commit/554e4e9): **Remove the deprecated `<aparte-chat-input>` element** (`AparteChatInput`). It was the legacy
  monolithic composer — 653 lines of `innerHTML`-heavy code that auto-registered on import into
  the zero-dep core, was untested, and predated the modern `<aparte-composer>` + `<aparte-chat>`
  composition. It is no longer exported, registered, or styled; the elicitation panel and the
  client's target resolution already preferred `<aparte-composer>` and simply drop the legacy
  fallback. Reclaims bundle size and removes an untested surface from core.

  **Breaking** (pre-1.0, shipped minor): consumers still on `<aparte-chat-input>` should move to
  `<aparte-chat>` (or `<aparte-composer>` directly). The `AparteInputConfig` type stays.
  <sub>`@aparte/core`</sub>

- [f8a6dd7](https://github.com/apartejs/aparte/commit/f8a6dd7): De-duplicate the wrappers' `AparteUi` prop-applier. The four wrappers each
  carried a byte-identical vanilla-DOM prop applier + event list; they're now in
  `@aparte/core` as `applyElementProps(el, props, transformValue?)` and
  `DEFAULT_UI_EVENTS`. Vue passes `toRaw` as the transform to unwrap its reactive
  proxy. No public wrapper API change.
  <sub>`@aparte/core`</sub>

- [d60e2c8](https://github.com/apartejs/aparte/commit/d60e2c8): Type the request `_meta` channel. `AparteChatRequest._meta` is now
  `AparteRequestMeta` instead of `Record<string, unknown>`: the five well-known
  keys (`pipeline`, `prefixSegments`, `artifactHint`, `artifactRaw`, `artifactXml`)
  are typed and documented, while an open index signature keeps it a channel for
  consumer-specific context. New exported types: `AparteRequestMeta`,
  `ApartePipelinePhase`, `AparteArtifactHint`.
  <sub>`@aparte/core`</sub>

- [e8d9b32](https://github.com/apartejs/aparte/commit/e8d9b32): Unify custom action registration into one zoned API.

  A single `registerAction(action)` now places a button via
  `zones: ('composer' | 'bubble')[]`, with per-zone options
  (`composer: { position, hidden }`, `bubble: { roles }`). Every action emits the
  declarative `aparte-action` event (now carrying `zone`), with an optional
  `onClick` callback fired alongside for convenience.

  **Breaking:** `registerBubbleAction`, `getRegisteredBubbleActions` and
  `unregisterBubbleAction` are removed, and the `AparteBubbleAction` type is merged
  into `AparteAction` (use `zones: ['bubble']` + `bubble.roles`). `getActions(zone)`
  now requires a zone argument.
  <sub>`@aparte/core`</sub>

- [1573645](https://github.com/apartejs/aparte/commit/1573645): One imperative API across the four wrappers:

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
  <sub>`@aparte/angular`, `@aparte/react`, `@aparte/svelte`, `@aparte/vue`</sub>

### Patch Changes

- [6ab5682](https://github.com/apartejs/aparte/commit/6ab5682): Round-3 audit follow-ups (bounded fixes):

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
  <sub>`@aparte/core`, `@aparte/react`, `@aparte/svelte`, `@aparte/vue`</sub>

- [4065fd6](https://github.com/apartejs/aparte/commit/4065fd6): Bound the binary-artifact preview cache. `_binaryArtifactCache` held full file buffers
  (pdf/xlsx/docx) keyed by segment id and was never evicted, so a long session generating
  many binary artifacts grew memory for the page's lifetime. It's now capped (LRU-ish: cap
  24, oldest evicted on insert, re-insert refreshes recency).
  <sub>`@aparte/core`</sub>

- [307039b](https://github.com/apartejs/aparte/commit/307039b): Fix a small memory leak in the segment renderers: two internal per-segment throttle
  maps (syntax-highlight and artifact-dispatch debouncing) grew one entry per streamed
  segment for the page's lifetime. They're now bounded and evict oldest like the
  neighbouring binary-artifact cache, so long-running sessions no longer accumulate them.
  <sub>`@aparte/core`</sub>

- [333d301](https://github.com/apartejs/aparte/commit/333d301): Tighten the client's typing: the four near-identical local target interfaces
  (`AparteChatElement`/`RetryTarget`/`EditTarget`/`CompactTarget`) are consolidated into the
  one module-level `AparteChatTargetElement`, which removes ~two dozen gratuitous
  `(target as any).method` casts; the three `catch (err: any)` become `catch (err: unknown)`
  with narrowing; and `(segment as any).content` reads become a typed `{ content?: string }`
  cast. No behaviour change — pure typing rigor (the `as any`s were papering over methods the
  element already declares). Drops the repo's `no-explicit-any` warning count from ~63 to ~39.
  <sub>`@aparte/core`</sub>

- [14f1f1d](https://github.com/apartejs/aparte/commit/14f1f1d): Collapse the triplicated send / retry / edit tail into one `_streamTurn` helper.

  `_handleSend`, `_handleRetry` and `_handleEdit` each re-implemented the same
  provider → tools → request-interceptor → `toolChoice:'none'` strip → reset-abort →
  `aparte-message-start` → `_streamLoop` → `aparte-message-done` / lifecycle-error
  sequence. They now share one private method, so that flow can't drift between the
  three entry points. As part of it, `_handleSend` uses the shared `_resolveAuth`
  helper and resets the abort flag before streaming — the two divergences the audit
  flagged (a documented past drift). No behavior change on the happy path (verified:
  867 unit incl. the retry/edit suites + parity, and 27/27 browser E2E).
  <sub>`@aparte/core`</sub>

- [18d2065](https://github.com/apartejs/aparte/commit/18d2065): Enforce lint at zero warnings (`eslint . --max-warnings 0`) and clear the 37
  `no-explicit-any` backlog — each replaced with a precise type or, where DOM /
  custom-element interop genuinely requires it, a structural `unknown` cast (no blanket
  `any` disables). A few public types are tightened from `any` to a precise type or
  `unknown` (e.g. `AparteCustomSegment.data`, `AparteError` context) — a type-safety
  improvement with no runtime change.
  <sub>`@aparte/core`</sub>

- [6d6123e](https://github.com/apartejs/aparte/commit/6d6123e): Fix an XSS sink: the chat bubble's public `name` attribute was interpolated raw into
  `innerHTML` on initial render, while every sibling field (attachment names, etc.) was
  escaped. An app that binds an untrusted author/persona name into `name` would ship a
  script injection. Escaped it, consistent with the other fields, + a regression test.
  <sub>`@aparte/core`</sub>

- [97bd6c5](https://github.com/apartejs/aparte/commit/97bd6c5): Escape three more consumer/stream-supplied fields that reached innerHTML unescaped: the
  composer action `label` and input `placeholder` (attribute positions) and a `message-id`
  CSS attribute-selector in the viewport (now `cssEscape`d like its siblings). Harden the
  bubble / conversation-list / attachment escape helpers to also escape `'`. Add a
  best-effort `.catch` to the fire-and-forget syntax-highlight and clipboard promises so a
  rejecting highlighter or clipboard write degrades silently instead of an unhandled rejection.
  <sub>`@aparte/core`</sub>

- [8417976](https://github.com/apartejs/aparte/commit/8417976): Harden the internal `[data-segment-id]` / `[message-id]` attribute-selector lookups in
  the bubble and viewport against a hostile, stream-supplied id: interpolated ids are now
  escaped for the quoted-attribute context (via a small `cssEscape` helper that needs no
  `CSS` global, so it also works in SSR/test runtimes). An id containing `"` (e.g. a
  provider-supplied tool-call id) can no longer throw a `SyntaxError` that drops a render
  update, nor form a selector list that mis-targets another element. Ids are random UUIDs
  by default, so this is defense-in-depth.
  <sub>`@aparte/core`</sub>

- [1f6c43e](https://github.com/apartejs/aparte/commit/1f6c43e): Escape the `thinking` segment's `label` before it reaches `innerHTML` (the adjacent
  `content` was already escaped). Built-in callers always pass a hardcoded label, but a
  host rendering a model-derived label into a thinking segment would otherwise have a
  stored-XSS sink — closed defensively, consistent with the other renderer escapes.
  <sub>`@aparte/core`</sub>

- [2efef6f](https://github.com/apartejs/aparte/commit/2efef6f): Extract `_streamLoop`'s ~190-line `tool_use` case into a `_handleToolUseEvent` helper
  (built-in `create_artifact`, per-tool renderer, the human-in-the-loop approval gate, and
  the handler run with its timeout/abort). The loop now delegates and reads the
  continue/stop signal back. Behaviour-preserving — proven by the engine parity golden-master
  that drives the real `_streamLoop`, plus the client tool/HITL suites (869 tests, 27/27 e2e).
  <sub>`@aparte/core`</sub>

- [0aefd9b](https://github.com/apartejs/aparte/commit/0aefd9b): Robustness fixes surfaced by the code audit:

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
  <sub>`@aparte/core`, `@aparte/engine`, `@aparte/provider-openai-compat`</sub>

- [0aefd9b](https://github.com/apartejs/aparte/commit/0aefd9b): Escape untrusted model output before it reaches `innerHTML` (two DOM-XSS paths):

  - **core** — the code-segment `language` (the ` ```lang ` fence tag, LLM-authored and
    prompt-injectable) is now HTML-escaped in both the label text and the
    `class="language-…"` attribute; the file-tree node `status` too.
  - **core primitives** — `<aparte-select>` and `<aparte-optgroup>` build their labels via
    `textContent`, not `innerHTML`, matching their own update paths.
  - **plugin-model-selector** — remote model names/ids and provider labels are escaped before
    the option list is (re)built.

  Reachable from a hostile/aggregating `/models` endpoint or a prompt-injected code fence.
  <sub>`@aparte/core`, `@aparte/plugin-model-selector`</sub>

- [9568c6b](https://github.com/apartejs/aparte/commit/9568c6b): Escape `data-segment-id` in every segment renderer. A segment id can embed an untrusted
  tool-call id (`tool-${toolCallId}`, taken verbatim from the endpoint's SSE `tool_calls[].id`),
  so the tool-call renderer — and, defense-in-depth, all other renderers plus the ask-question
  receipt — now HTML-escape it before it reaches `innerHTML`. Closes a DOM-XSS reachable from a
  hostile OpenAI-compatible endpoint (the same class as the code-fence `language` fix, in a
  sibling sink). Regression test added.
  <sub>`@aparte/core`, `@aparte/plugin-ask-user`</sub>

- [7e5cfb7](https://github.com/apartejs/aparte/commit/7e5cfb7): Teardown + sanitizer hardening from the audit:

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
  <sub>`@aparte/core`, `@aparte/angular`</sub>

- [75af64a](https://github.com/apartejs/aparte/commit/75af64a): Fix two browser-only defects surfaced by the new cross-framework browser E2E
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
  <sub>`@aparte/core`</sub>

- [fa5a3f8](https://github.com/apartejs/aparte/commit/fa5a3f8): Message editing now reuses the composer's contenteditable input instead of a bespoke
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
  <sub>`@aparte/core`</sub>

- [8a3890b](https://github.com/apartejs/aparte/commit/8a3890b): Isolate streaming state between multiple chats on one page. Lifecycle events
  (`aparte-message-start` / `done` / `error` / `aborted`) and `aparte-abort` now
  carry the target host's `targetId`, and a composer only reacts to its own host's
  turn. Before this, streaming in one chat flipped every composer to the "Stop"
  state, a `done` in one reset the others (hiding an active elicitation panel), and
  cancelling one aborted every scoped client. Id-less single-instance pages still
  broadcast unchanged.
  <sub>`@aparte/core`</sub>

- [49f4d70](https://github.com/apartejs/aparte/commit/49f4d70): Robustness hardening: bound the file-generation handler map so a generation that never
  terminates (e.g. the conversation is cleared mid-flight) can no longer leak its window
  listeners for the page's lifetime; add a compile-time exhaustiveness guard on the
  stream-event switch so a new event variant fails the typecheck instead of being silently
  ignored; and mark every intentional fire-and-forget promise in the streaming / render
  paths explicitly (type-aware lint now guards against unhandled rejections).
  <sub>`@aparte/core`</sub>

- [fcff831](https://github.com/apartejs/aparte/commit/fcff831): Re-export the `AparteSystemPromptVarsProvider` type from the package root (both
  the browser and Node entries) so consumers can type the argument of the public
  `AparteConfig.setSystemPromptVarsProvider()` without reaching into a deep import.
  <sub>`@aparte/core`</sub>

- [455fc81](https://github.com/apartejs/aparte/commit/455fc81): Branch + shell fixes:

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
  <sub>`@aparte/core`</sub>

- [6a50004](https://github.com/apartejs/aparte/commit/6a50004): Harden the default sanitizer's residual defense-in-depth gaps:

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
  <sub>`@aparte/core`</sub>

- [9ce7978](https://github.com/apartejs/aparte/commit/9ce7978): Fix a server-side-rendering crash on the framework wrappers. The Node/SSR entry
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
  <sub>`@aparte/core`</sub>

- [e96920a](https://github.com/apartejs/aparte/commit/e96920a): Type `aparte-composer-change` in the `HTMLElementEventMap` augmentation, so
  `el.addEventListener('aparte-composer-change', e => e.detail)` is typed like the other public
  events (it's in `DEFAULT_UI_EVENTS`, so the wrappers already forward it). Closes the gap where
  a forwarded, typed event was missing from the event map.
  <sub>`@aparte/core`</sub>

- [71c9167](https://github.com/apartejs/aparte/commit/71c9167): Packaging fixes surfaced by wiring `publint` + `are-the-types-wrong` into CI:

  - `@aparte/engine`: its emitted `.d.ts` re-exported submodules without `.js`
    extensions, so `node16` / `nodenext` consumers got unresolved types (bundlers
    hid it). Added the extensions — the types now resolve under every module mode.
  - `@aparte/plugin-ask-question`: declared `"sideEffects": true`. Importing the
    package registers `<aparte-ask-question>` as an import-time side effect, which
    a tree-shaking bundler could otherwise legally drop.
  <sub>`@aparte/engine`, `@aparte/plugin-ask-user`</sub>

- [f2d75b0](https://github.com/apartejs/aparte/commit/f2d75b0): Fix four teardown/cancellation bugs: the model selector could permanently lock itself out
  of re-rendering if its render threw (now `try/finally`); the Angular Observable to
  async-iterator adapter could hang forever if torn down mid-`await` (its `return()` now
  settles the pending read); and the OpenAI-compat and AI-SDK providers now `cancel()` the
  underlying stream on consumer cancel instead of draining the vendor body to the end (AI-SDK
  also can no longer process a second terminal event).
  <sub>`@aparte/provider-ai-sdk`, `@aparte/provider-openai-compat`, `@aparte/plugin-model-selector`, `@aparte/angular`</sub>

- [aff7e98](https://github.com/apartejs/aparte/commit/aff7e98): Cancelling a local-model stream now actually STOPS generation: the worker runs each generate
  under an `InterruptableStoppingCriteria` and the stream's `cancel()` interrupts it, instead of
  letting the model run to `max_new_tokens` off-thread after the consumer aborted.
  <sub>`@aparte/provider-transformers`</sub>

- [056dafd](https://github.com/apartejs/aparte/commit/056dafd): Raise the monorepo TypeScript strictness floor: `noUncheckedIndexedAccess` and
  `noUnusedParameters` move into `tsconfig.base.json`, so every package inherits them (core /
  engine / providers already opted in locally; plugins / wrappers / locales now do too). The
  new floor surfaced — and this fixes — real unchecked index accesses in `model-selector`
  (auto-select + single-provider option list) and `ask-question` (single-question path):
  each now guards the array element instead of assuming it exists.
  <sub>`@aparte/plugin-ask-user`, `@aparte/plugin-model-selector`</sub>

- [0aefd9b](https://github.com/apartejs/aparte/commit/0aefd9b): README quick-start no longer re-adds the user message in the `messageSent`/`onSend` handler:
  the chat appends it automatically on send, so the previous example rendered every sent message
  twice (Angular: discarded the optimistic message via a `[messages]` round-trip). Now aligned
  with the wrapper JSDoc and the tested playgrounds.
  <sub>`@aparte/angular`, `@aparte/react`, `@aparte/svelte`, `@aparte/vue`</sub>

- [f8a6dd7](https://github.com/apartejs/aparte/commit/f8a6dd7): De-duplicate the wrappers' `AparteUi` prop-applier. The four wrappers each
  carried a byte-identical vanilla-DOM prop applier + event list; they're now in
  `@aparte/core` as `applyElementProps(el, props, transformValue?)` and
  `DEFAULT_UI_EVENTS`. Vue passes `toRaw` as the transform to unwrap its reactive
  proxy. No public wrapper API change.
  <sub>`@aparte/angular`, `@aparte/react`, `@aparte/svelte`, `@aparte/vue`</sub>

- [a6ed936](https://github.com/apartejs/aparte/commit/a6ed936): One canonical imperative contract for `<AparteChat>` across the four wrappers.

  `@aparte/core` now exports `AparteChatImperativeApi` — the ~20-method surface every
  framework handle delegates to `AparteChatHost`. React's `AparteChatHandle` and
  Vue/Svelte's `AparteChatInstance` are now type aliases of it, and the Angular
  component `implements` it, so any per-wrapper drift (a missing or mistyped method)
  is a **compile error** instead of a silent divergence.

  **Angular parity:** adds the imperative `setConversationId(id)` method (the
  `conversationId` `@Input` remains the declarative path), closing the one gap where
  Angular's handle differed from the other three.
  <sub>`@aparte/react`, `@aparte/svelte`, `@aparte/vue`</sub>

<sub>Version-only bumps (no changes of their own): `@aparte/plugin-marked`, `@aparte/plugin-shiki`, `@aparte/plugin-streaming-markdown`, `@aparte/locale-fr`.</sub>
