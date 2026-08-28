# @aparte/engine

## 0.15.0

## 0.14.0

### Minor Changes

- 461a692: New `<aparte-context>`: a gauge of the model's context window. It reads each turn's reported usage and the window the current model declares (or a `window` attribute), sets `data-level` to `ok` / `warn` / `danger` at the `warn` / `danger` fractions (75 % / 90 %), fires `aparte-context-threshold` when the level changes, and with `auto-compact` dispatches `aparte-compact` on reaching danger. New in `@aparte/engine`: `createCompactionSelector({ contextWindow, systemPrompt })`, the budget-aware `compactionSelector` for `AparteClient` — the newest turns that fit stay verbatim, the rest is summarised. New locale key `contextLabel`, translated in `@aparte/locale-fr`.

  The first product built on the library showed a context badge that turned red at 90 % — and then nothing happened, because `compact()` existed, `compactionSelector` existed, the engine's compactor existed, and no piece joined them. This is the join: the gauge watches, the selector decides, and the two read the same window.

- 04289bb: `@aparte/core` now depends on `@aparte/engine` — first-party, nothing from outside `@aparte` is installed — so `npm i @aparte/core` installs both; nothing changes in how you call either package. `AparteStreamRunEvent`, `AparteStreamRunEmitter`, `AparteStreamRunOptions` and `AparteStreamRunner` are engine's `StreamRunEvent`, `StreamRunEmitter`, `StreamRunOptions` and runner shape under core's names. `@aparte/engine` no longer lists core as a peer dependency, and `createCompactionSelector` is typed structurally (`CompactableMessage`), so it takes core's messages without importing core.

  Decision D1 of the 2026-08-28 audit. The run-event contract was hand-mirrored across a "zero-import" boundary and policed by a compile-time guard that had itself been written around the one field that broke the seam; the same tool turn corrupted the history in two different shapes, one per loop, invisible to the parity suite precisely because they differ. The direction is settled: the loop is engine's, core drives it. This is the first half — the types; the inline loop's deletion is the second.

- 0850dee: `_meta.pipeline`, `_meta.artifactRaw` and `_meta.artifactXml` are removed from `AparteChatRequest`, and with them the `pipeline-waiting` segment and engine's artifact-XML state machine. `_meta.artifactHint` and `_meta.prefixSegments` stay and are documented; an `<artifact>` tag in the reply's text is parsed exactly as before, and the built-in `create_artifact` tool is unchanged. Gone in full: `ApartePipelinePhase`, the `pipeline-waiting` segment type with its renderer, its stylesheet and `ApartePipelineWaitingSegment`, and — in `@aparte/engine` — `ArtifactXmlStateMachine`, its types and the `phase-advance` / `artifact-open` / `artifact-chunk` / `artifact-close` run events.

  Decision D2 of the 2026-08-28 audit. The multi-phase pipeline and the raw-artifact turn were one product's orchestration wearing a library type — nothing in this repository emitted either, and a contract nothing exercises is maintained for nobody. The XML mode was a second path to what the stream parser already does natively with `<artifact>` tags, kept alive by a state machine that had to be mirrored between two loops. One path is left, the parser's, and the loop no longer branches on the request's metadata at all.

- cd5075e: `AparteClient` runs `@aparte/engine`'s `runStreamAgent` by default; core's inline copy of the agent loop is deleted. One behaviour changes: a tool call stopped while it waited for approval is now marked `aborted`, never `rejected`, and a host that stops the turn from the approval panel itself no longer leaves the call stuck at `awaiting-approval`. Nothing else changes in how you call either package. `streamRunner` stays, to wrap or replace that loop (`(opts) => runStreamAgent({ ...opts, onHistoryAppend })` for a host that owns its transcript). `deriveArtifactKind` is the engine's, re-exported by core under the same name.

  Decision D1 of the 2026-08-28 audit, second half. Two copies of one loop were "kept in sync" by hand and by a parity suite; the same tool turn corrupted the history in two different shapes, one per copy, invisible to that suite precisely because they differed. The suite's 26 scenarios were snapshotted while both loops ran and were equal — the inline loop's behaviour, pinned — and now live in core, where they also hold the client's wiring to a direct engine run. That is what found the client writing `status: 'streaming'` once too often, and what dropped the change from 2 470 lines of client to 1 750.

### Patch Changes

- d299096: A turn that calls `create_artifact` and another tool no longer sends the second tool's result without the call that declares it — a history an Anthropic-shaped API rejected outright. The turn's `tool_call` envelope is now created once, held by reference, and declares every call whose `tool_result` follows it; `onHistoryAppend` reports the envelope once, when the first call completes, and the calls that complete later in the same turn are already in that same object's `toolCalls`.

  The loop used to guess whether the turn's envelope was already in the history by scanning it for any of the turn's call ids. The built-in `create_artifact` fast path pushed a fresh envelope of its own, the scan found the artifact's id in it, concluded "already pushed", and the next tool's result went out orphaned. A reference cannot be guessed wrong.

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

- 114431c: `runStreamAgent`'s documentation reaches its documentation.

  The docblock describing the package's headline export sat six lines and another comment
  above the function, separated from it by the `warnUnknownStreamEvent` helper. A docblock
  that is not adjacent to its declaration is attached to nothing, so TypeDoc read the
  helper's comment as the neighbouring one and the generated `@aparte/engine` reference
  carried `runStreamAgent()` with no description at all — the export its own page
  description names first.

  The helper moves above the block. No behaviour changes; the same trap the
  custom-elements analyser has when a class docblock is pushed above an import.

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

- f52dbe9: **Refusing a tool no longer ends the turn.** The model gets a turn to answer in, so it reads the refusal.

  Before: a refusal appended a _"Tool execution was rejected by the user."_ tool_result and stopped the run — so the one sentence written for the model was never sent to it. Telling the assistant what you actually wanted meant retyping it as a new message, which it then read out of order.

  After: the turn's **remaining** tool calls are still skipped (the model may have asked for several, and refusing one cannot license the others — that part was a real fix and it stands), and then another turn runs.

  This needed one flag to become three states, because a refusal answers two questions differently: _run the calls that follow this one?_ — no; _take another turn?_ — yes. Core's `_handleToolUseEvent` returns `'continue' | 'respond' | 'halt'`; the engine's loop `break`s without clearing `continueLoop`. Both changed together, and the parity suite stayed green through it — which is the suite doing its job: it asserts the two loops agree, never what they do. The scenario named _"rejected stops the loop identically"_ had to be renamed by hand for exactly that reason.

  Two other outcomes are now visibly distinct from a refusal rather than sharing its exit: a per-tool turn limit, a missing handler, and an abort all `halt` and tell the model nothing.

  **If you depended on the old behaviour** — a refusal ending the run — refuse from an `approvalResolver` and stop the client yourself, or set `maxTurns: 1` on the tool.

- 094d438: **The tool-approval decision moves out of the transcript and into the composer.**

  A request that blocks the run is answered where the user answers. That is now a rule for the library, not a choice made once: the composer is where a question already went, and the approval gate was the only decision surface left in a bubble. It was older than the mechanism that should have carried it — built with a segment renderer and a `document` event because neither `showPanel` nor a typed presenter existed yet — and nothing came back for it, partly because for a stretch the whole human-in-the-loop path was inert and so nothing exercised it.

  **What you see.** The `tool_call` pill stays in the transcript as the **anchor**, saying which tool is waiting, with no role, no tab stop and nothing clickable. The choices appear in the composer, each settling on the first click, above a quiet field for saying what to do instead. The thing being judged stays in the thread, which is scrollable, copyable and persisted; the panel is capped at half the viewport and could not hold a diff or a plan.

  **Breaking, pre-1.0, no shims:**

  - **`aparte-tool-decision` is deleted** — the event, `AparteToolDecisionDetail`, its event-map entry and the `document` listener that answered it. It existed only because a segment renderer has no reference to the client. To answer programmatically, pass an `approvalResolver` or register your own presenter; both see the whole request instead of an id on an event.
  - **`AparteToolApprovalResolver` and `StreamApprovalResolver` take the CALL**, `(call, signal)` rather than `(toolCallId, signal)`. You cannot ask a person "run this?" without naming what — and an id alone forced a lookup table filled by one event and read by another, the shape that breaks in silence.
  - Both resolvers may return an **`instruction`**, the words the model reads back on a refusal.
  - **`AparteElicitationRequest` gains `kind` and `options`**, and `schema` is now optional — required on a `'question'`, absent on an `'approval'`.

  **New:** `buildApprovalPanel` and `BuiltApprovalPanel`, `AparteApprovalOption` and `AparteApprovalAnswer`, and four locale keys (`approvalAsk`, `approvalWaiting`, `approvalInstructionPlaceholder`, `approvalOptionsLabel`), translated in `@aparte/locale-fr`.

  **`<aparte-chat>` now ships `<aparte-elicitation>` in its default composition.** The built-in gate asks through the presenter, so a chat without one could not honour `needsApproval` at all. An affordance core honours end to end is on by default; leaving this out would have made the gate depend on a tag nobody was told to write. Author-provided compositions are untouched, as always.

  **The options come with the request.** Core supplies two — the tool's name as the question, Approve and Reject — and anything richer is the host's: a scope option ("and always for this tool") exists only because an app wrote the label and can remember the grant. Core never invents one and never interprets one.

  **Also fixed, in passing:** a panel's own buttons inherited the composer row's 44×44 action-control sizing and rendered as circles with their labels spilling out. Any panel containing a button hit this; the approval options were the first that do.

### Patch Changes

- 6f262cf: Three fixes to the human-in-the-loop gate. No API changes: nothing that compiles today stops compiling.

  **A stop is no longer reported to the model as a refusal.** Pressing Stop while a tool waited for approval stamped the segment `rejected` and put "Tool execution was rejected by the user." into the history — the sentence the model reads named a decision nobody made. The abort path resolved `{ approved: false }`, the same value an explicit Reject produces, so the gate could not tell them apart. It now asks the signal instead of the value, and an aborted wait stamps `aborted` and appends no `tool_result`: there is nothing true to tell the model, which is already how a handler aborted mid-run is treated.

  **A `needsApproval` tool with no `approvalResolver` aborts instead of inventing a refusal.** `runStreamAgent` defaulted to `async () => ({ approved: false })`, so a host that had simply forgotten to wire a resolver was reported to the model as having refused.

  **A reloaded conversation stops waiting for a decision nobody can give.** A `tool_call` persisted as `awaiting-approval` came back still awaiting it, with Approve / Reject buttons wired to a listener that went with the page — and `isSegmentSettled` reads _status_ for a tool call, so the segment also stayed open and collected an `endedAt` from the next turn-close. `adoptSegment` now normalises it to `aborted` on every load path: nobody refused it, the page simply went away. The persistence guide documented this as something core could not fix for you; that half of the paragraph is gone, and `pending` — the same defect on the sibling nobody had looked at — is named as still outstanding.

  **`AparteToolDecisionDetail.targetId` is declared.** The runtime always sent it and a test read it, so reaching the chat id on a public event required casting past its own type.

## 0.10.0

## 0.9.0

## 0.8.0

### Minor Changes

- c33d2b0: A fourth cold audit: two CRITICALs, fourteen MAJORs, and the guards that let four of them in

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

- 950261d: The `<artifact>` XML streamer is a file, and its twin no longer disagrees with it

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

### Minor Changes

- fcacade: `runStreamAgent` gained an optional **`onHistoryAppend`** hook: it reports every turn the loop
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

- 71c9167: Packaging fixes surfaced by wiring `publint` + `are-the-types-wrong` into CI:

  - `@aparte/engine`: its emitted `.d.ts` re-exported submodules without `.js`
    extensions, so `node16` / `nodenext` consumers got unresolved types (bundlers
    hid it). Added the extensions — the types now resolve under every module mode.
  - `@aparte/plugin-ask-question`: declared `"sideEffects": true`. Importing the
    package registers `<aparte-ask-question>` as an import-time side effect, which
    a tree-shaking bundler could otherwise legally drop.

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
