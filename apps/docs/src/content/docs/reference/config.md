---
title: aparteGlobalConfig & core API
description: The core JS API in one place — the aparteGlobalConfig singleton, AparteClient, and the transports — signatures straight from packages/core/src.
sidebar:
  order: 1
---

The [Components](/components/), [CSS variables](/reference/css-variables/) and
[`@aparte/engine`](/reference/engine/) pages are generated references for those surfaces.
This page is the companion for the single biggest surface that has none: the **core JS
API** — `aparteGlobalConfig`, `AparteClient`, and the transports. Every signature below is
copied from `packages/core/src`; where a type is complex it is simplified for
readability without changing its meaning — follow the source links for the full shape.

## `aparteGlobalConfig`

`aparteGlobalConfig` is the page-wide **singleton** instance of `AparteConfig`
(`packages/core/src/config/aparte-config.ts`) — the "Invisible but Flexible" dependency-injection
hub. Everything below is a method on it, e.g. `aparteGlobalConfig.registerAIProvider(...)`.

```ts
import { aparteGlobalConfig } from '@aparte/core';
```

Most setters call an internal `_notify()`, which re-renders already-mounted components
(and dispatches a `window` `aparte-config-change` event) — so a live change (theme
switch, locale swap, new icon set) propagates without a reload.

### Providers, keys & transport

Registers the AI vendors the chat can talk to, how their API keys are resolved, and
where the request is sent.

- `registerAIProvider(...providers: AparteAIProvider[]): void` — register one or more `AparteAIProvider` implementations (e.g. from `@aparte/provider-openai-compat`).
- `unregisterAIProvider(id: string): void` — remove a provider by id.
- `getAIProviders(): AparteAIProvider[]` — all registered providers, filtered by `modelConfig.enabledProviders` if set.
- `getAIProvider(id: string): AparteAIProvider | undefined` — a single provider by id.
- `refreshProviderModels(providerId: string): Promise<AparteAIModel[]>` — resolve the key then call the provider's `fetchModels`.
- `setKeyProvider(provider: AparteKeyProvider): void` — register a function that resolves an API key for a given provider id.
- `getKey(providerId: string): Promise<string | undefined>` — read the key for a provider via the registered key provider.
- `setTransport(transport: AparteTransport): void` — set where chat requests go and how auth is handled. Defaults to `AparteDirectTransport`.
- `getTransport(): AparteTransport` — the active transport.

### Renderers & render hooks

Swap the markup of specific chat regions while keeping their built-in behavior (streaming,
show/hide, class hooks). Each accepts `string | HTMLElement` and `null` clears it.

- `setStatusRenderer(renderer: AparteStatusRenderer | null): void` / `getStatusRenderer(): AparteStatusRenderer | null` — the typing indicator's inner markup.
- `setErrorRenderer(renderer: AparteErrorRenderer | null): void` / `getErrorRenderer(): AparteErrorRenderer | null` — the content of an error bubble.
- `setAttachmentRenderer(renderer: AparteAttachmentRenderer | null): void` / `getAttachmentRenderer(): AparteAttachmentRenderer | null` — the chip for each user-message attachment.
- `setSiblingNavRenderer(renderer: AparteSiblingNavRenderer | null): void` / `getSiblingNavRenderer(): AparteSiblingNavRenderer | null` — the `‹ N / M ›` branch-position indicator.
- `setBubbleShellRenderer(renderer: AparteBubbleShellRenderer | null): void` / `getBubbleShellRenderer(): AparteBubbleShellRenderer | null` — the structural skeleton of `<aparte-chat-bubble>` (advanced; must honor the `.aparte-message` class-hook contract).
- `setAvatarProvider(provider: AparteAvatarProvider | null): void` / `getAvatarProvider(): AparteAvatarProvider | null` — fills the avatar host element with custom DOM (e.g. a mounted framework component).
- The artifact preview builder is not here any more: an artifact is [`@aparte/plugin-artifacts`](/plugins/artifacts/)'s, and its `preview` option takes the builder (with the sandbox note that used to sit on this page).

### Markdown, highlight & sanitizer

Controls how assistant text becomes HTML, and what scrubs that (untrusted, LLM-authored)
HTML before it is injected via `innerHTML`.

- `setMarkdownProvider(fn: AparteMarkdownProvider): void` — a one-shot Markdown renderer (`(raw: string) => string`).
- `renderMarkdown(raw: string): string` — render Markdown via the registered provider (sanitized), falling back to HTML-escape + `<br>`.
- `setStreamingMarkdownProvider(fn: AparteStreamingMarkdownProvider): void` — an incremental renderer factory bound to a target element, used while a message is still streaming.
- `createStreamingMarkdownRenderer(target: HTMLElement): AparteStreamingMarkdownRenderer | null` — instantiate the streaming renderer for `target`, or `null` if none is registered.
- `setHighlightProvider(fn: AparteHighlightProvider): void` — a syntax highlighter, sync or async: `(code, lang) => string | Promise<string>`.
- `hasHighlightProvider(): boolean` — whether a highlighter is registered.
- `highlightCode(code: string, lang: string): Promise<string>` — highlight via the registered provider (sanitized), falling back to a plain `<pre><code>`.
- `setHtmlSanitizer(sanitizer: AparteSanitizer | null): void` — replace the built-in allowlist sanitizer, or pass `null` to disable it (trusted content only). **What a link in a reply does by default:** the built-in sanitizer sends every link that resolves off-site to its own tab (`target="_blank" rel="noopener noreferrer"`) — `https://…`, `http://…`, and the spellings that resolve off-site just the same: the scheme-relative `//host`, a value written with leading whitespace, a backslash where a slash is expected (`/\host`), and a single slash after a scheme (`http:/host`). The link was written by the model and a bare anchor navigates the frame the chat lives in — in an Electron window, the whole app. A `target` in the model's own markup is a wish, not a decision: `_self` is honoured only on a link that was staying here anyway, anything else (`_top`, `_parent`, a named frame — and `_self` on an off-site link, where it would be a downgrade of the default rather than a preference) becomes that same new tab, and a model-written `rel` never survives. Same-site and in-page links are left as written. To route links yourself, listen for the bubble's cancelable `aparte-link-click` (`detail: { href, anchor, messageId }`, bubbles to the chat host) and call `preventDefault()`; no DOM interception needed.
- `sanitizeHtml(html: string): string` — run the active sanitizer over provider-produced HTML. **Off the browser** (SSR, Node, a test runner with no `DOMParser`), the built-in degrades to a regex net: it drops the same dangerous tags — content and all, except the three document-structure tags (`html`, `head`, `body`), whose tags go but whose content stays, as a real parser would — and the same inline handlers and executable URL schemes, but a regex is not a parser and has known evasions. It is a safety net, not a security boundary; on a non-browser runtime rendering untrusted HTML, register a real sanitizer (DOMPurify + jsdom) here.

### System prompt

- `setSystemPrompt(template: string | undefined): void` — set the system-prompt template (`{{key}}` placeholders).
- `getSystemPromptTemplate(): string | undefined` — the raw template, unresolved.
- `setSystemPromptVarsProvider(fn: AparteSystemPromptVarsProvider): void` — a function returning the `{{key}}` → value map, called at request time.
- `resolveSystemPrompt(): string | null` — the template with all placeholders substituted, or `null` if none is set.
- `resolveToolSystemPrompts(): string | null` — the registered tools' own `systemPrompt`s, joined in registration order, or `null` if none set one. `AparteClient` sends this as a system message of its **own**, after the app's template. Assembling a request by hand? Read it, or every registered tool's instructions are silently dropped.

### Locale

Translatable UI strings (composer placeholder, Copy/Retry buttons, "thinking…", etc.).
English ships in core as `APARTE_DEFAULT_LOCALE`; other languages are injected.

- `setLocale(locale: AparteLocale & AparteLocaleExtensions): void` — replace the active locale. `AparteLocaleExtensions` is the open half (`Record<string, string | undefined>`): a plugin's own keys live there, while `t()` accepts only the keys `AparteLocale` declares — a typo in a key is a compile error, not an empty label.
- `getLocale(): AparteLocale & AparteLocaleExtensions` — the active locale.
- `extendLocale(translations: Partial<AparteLocale> & AparteLocaleExtensions): void` — merge partial translations onto the current locale (e.g. for a plugin registering its own strings).
- `t(key: keyof AparteLocale): string` — look up a translated string, falling back to `APARTE_DEFAULT_LOCALE`.
- `resetLocale(): void` — go back to `APARTE_DEFAULT_LOCALE`, dropping anything `setLocale`/`extendLocale` put there.

See the [Localization](/guides/localization/) guide.

### Icons

- `setIconProvider(provider: AparteIconProvider): void` — a set of icon functions (`() => string` HTML each), e.g. a FontAwesome bridge.
- `getIconProvider(): Required<AparteIconProvider>` — the registered provider, or a fallback built from `APARTE_DEFAULT_ICON_FALLBACKS`. `Required<>` is the point: every key resolves, so a caller never null-checks a glyph.
- `getIcon(name: AparteIconName): string` — HTML for one icon by name, falling back to the built-in default.

A loading placeholder is a CSS recipe, not a provider: `.aparte-skeleton` (with `--text`, `--circle`, `--rect`) in the [classes reference](/reference/classes/#skeleton). Core never asks for one — nothing it renders has a loading state that is not the message itself — so there is no `setSkeletonProvider` to call.

### Actions

Custom buttons placed in the composer toolbar and/or the message (bubble) toolbar — one
merged registry, a `zones` parameter picks where each appears.

- `registerAction(action: AparteAction): void` — register (or overwrite, by `id`) a custom action button.
- `getActions(zone: AparteActionZone): AparteAction[]` — actions for a zone (`'composer' | 'bubble'`), sorted by `order`.
- `unregisterAction(id: string): void` — remove an action from every zone.
- `setActionHidden(id: string, hidden: boolean): void` — show/hide a composer action button at runtime.
- `setBubbleActions(config: AparteBubbleActionsConfig): void` — configure which built-in buttons (`copy`/`retry`/`edit`/`feedback`/`info`) appear in bubbles, or set explicit per-role ordered lists. Only `copy` is on by default; the others need a host to honour them (see [What ships enabled](/guides/customization/#what-ships-enabled)).
- `getBubbleActions(): { copy, retry, edit, feedback, info, user?, assistant? }` — the resolved bubble-actions config (defaults applied).
- `APARTE_DEFAULT_BUBBLE_ACTIONS` — the shipped defaults, exported so you can read them instead of hard-coding them.

### Host handlers

The affordances core renders but cannot complete — it only asks, through a DOM event, and
your app does the work. Declare what you handle; the rest isn't offered.

- `setHostHandlers(config: AparteHostHandlersConfig): void` — declare what you handle. One today:
  - `attachmentPreview` — image tiles ask for a lightbox via `aparte-attachment-preview`.

  Off by default. (`artifactRedownload` and `artifactRehydrate` left with the artifact: the plugin's `onBinary` is a function, not a declaration.)
- `getHostHandlers(): Required<AparteHostHandlersConfig>` — the resolved declarations, every field present. `Required<…>` on purpose: adding a handler then fails to compile until every reader handles it.
- `APARTE_DEFAULT_HOST_HANDLERS` — the shipped defaults (nothing declared).

See the [Customization](/guides/customization/) guide.

### Tools & tool renderers

- `registerTool(tool: AparteTool, handler: AparteToolHandler): void` — register a tool definition together with its handler.
- `unregisterTool(name: string): void` — remove a tool by name.
- `getTools(): AparteTool[]` — all registered tool definitions (passed in the chat request).
- `getToolHandler(name: string): AparteToolHandler | undefined` — the handler for a tool by name.
- `registerToolRenderer(toolName: string, renderer: AparteToolRenderer): void` — a per-tool segment renderer, controlling what appears in the bubble when that tool is called: `render`, and optionally `setup`, `update` (patch in place when the call changes, instead of a rebuild), `relabel` (re-read the locale on a config change) and `getStyles`.
- `unregisterToolRenderer(toolName: string): void` — remove a per-tool renderer.
- `registerStreamBlock(block: AparteStreamBlock): void` — teach the stream parser a tagged block: `<tag attr="…">…</tag>` in the model's prose becomes the segment `block.toSegment` builds, streamed delta by delta (see [Teach the parser a block](/guides/customization/#teach-the-parser-a-block)). One grammar per tag; read when a turn starts.
- `unregisterStreamBlock(tag: string): void` / `getStreamBlocks(): AparteStreamBlock[]` — forget a grammar; list the registered ones.
- `getToolRenderer(toolName: string): AparteToolRenderer | undefined` — the renderer for a tool name, if any.
- `setApprovalPolicy(policy: AparteApprovalPolicy | null): void` — decide per **call** whether a tool runs, asks, or is refused: `allow` runs without asking, `ask` puts the call to the person exactly as a `needsApproval` tool is, `deny` refuses it with the ruling's own `reason` as what the model reads. Returning `undefined` leaves the tool's `needsApproval` to decide; `null` removes the policy. A host that owns its `approvalResolver` on `AparteClientOptions` is not affected — that resolver already decides everything. The four modes ready-made: [`@aparte/plugin-approval`](/plugins/approval/).
- `getApprovalPolicy(): AparteApprovalPolicy | null` — the registered policy, or `null`.
- `ruleOnToolCall(call: AparteToolCall): AparteApprovalRuling` — what the policy says about one call, with the tool's own `needsApproval` as the answer when it has no opinion. The one place the two are combined, so the client's gate predicate and its approval channel cannot disagree.

See the [Tools & human-in-the-loop](/guides/tools/) guide.

### Model preference

- `setModelConfig(config: AparteModelConfig): void` — set model-selection config (`enabledProviders`, `modelFilters`, `defaultProvider`, `defaultModel`); auto-saves via the model-preference provider when both a default provider and model are set.
- `getModelConfig(): AparteModelConfig` — the current model configuration (a shallow copy).
- `hasSelectedModel(): boolean` — `true` when both a provider and a model are selected.
- `setRequireModelSelection(required: boolean): void` — opt-in: gate `<aparte-composer>` (block send + grey out) until a model is selected.
- `getRequireModelSelection(): boolean` — whether that gate is active.
- `getCurrentModel(): AparteAIModel | undefined` — the selected model object, when its provider's model list is available synchronously.
- `setModelPreferenceProvider(provider: AparteModelPreferenceProvider): void` — register `{ save, load }` for host-app-agnostic persistence of the selected provider + model.
- `restoreModelPreference(): AparteModelPreference | null` — restore a previously saved preference via the registered provider (call once at startup).

### Conversation manager

- `setConversationManager(manager: AparteConversationManager): void` — register a `AparteConversationManager` so any UI controller can persist/load conversations without a framework coupling.
- `getConversationManager(): AparteConversationManager | undefined` — the registered manager, if any.

See the [Conversation persistence](/guides/conversation-persistence/) guide.

### Elicitation (human-in-the-loop)

- `setElicitationPresenter(presenter: AparteElicitationPresenter | null): void` — register the presenter that renders a typed input request (choice / confirmation / text field / form) and resolves with the user's answer. `<aparte-elicitation>` registers itself here by default.
- `getElicitationPresenter(): AparteElicitationPresenter | undefined` — the registered presenter, if any.
- `removeElicitationPresenter(presenter: AparteElicitationPresenter): void` — withdraw ONE presenter by identity, leaving the others registered. This is what an unmounting `<aparte-elicitation>` needs: `setElicitationPresenter(null)` clears the slot and takes every other mounted chat's presenter with it. Removing one that is not registered is a no-op.
- `setElicitationOptions(options: { allowOther?: boolean; layout?: 'stepped' | 'stacked'; answerOnClick?: boolean }): void` — how the built-in panel presents a request: whether a free-text "other" answer is offered alongside the choices, whether questions come one at a time or all at once, and whether a single choice answers on the click (buttons, the default) or keeps its radios and the composer's button.
- `getElicitationOptions(): { allowOther: boolean; layout: 'stepped' | 'stacked' }` — the options in force, both resolved.
- `setElicitationFieldRenderer(fn: AparteElicitationFieldRenderer | null): void` — draw one field of the panel yourself; `null` restores the built-in.
- `getElicitationFieldRenderer(): AparteElicitationFieldRenderer | undefined` — the registered field renderer, if any.
- `requestUserInput(request: AparteElicitationRequest): Promise<AparteElicitationResult>` — ask the user for typed input mid-run; resolves `{ action: 'accept' | 'decline', ... }`, or **rejects** with `AparteElicitationAbortError` when the request ends without an answer (a stopped turn, a fired signal, the question taken away, or no presenter mounted — `err.reason` tells the last one apart from the others). One request reaches the presenter at a time; a second one waits.

### Segment defaults

Values baked into a segment as it is inserted, so a renderer does not have to be told the
same thing on every message. They are read at insertion and not re-read afterwards, so
setting them later does not change segments already on screen.

- `setSegmentDefaults(type: string, defaults: AparteSegmentDefaults): void` — defaults for a segment type, core's own or one of yours.
- `getSegmentDefaults(type: string): AparteSegmentDefaults | undefined` — what is registered for a type.
- `clearSegmentDefaults(type: string): void` — drop them for a type.

### Subscribe & reset

- `subscribe(callback: () => void): () => void` — subscribe to configuration changes; returns an unsubscribe function.
- `reset(): void` — reset **all** configuration back to defaults (providers, tools, tool renderers, model selection, actions, renderers, locale, sanitizer, bubble-actions config). Useful between SPA navigations / test cases so registries don't leak.

## `AparteClient`

`AparteClient` (`packages/core/src/client/aparte-client.ts`) is "the automatic transmission for
aparté" — it listens for `aparte-send` (and `aparte-retry`/`aparte-edit`/`aparte-abort`)
on `window`, resolves the provider + key, calls the transport, and streams the parsed segments
into the target element.

```ts
import { AparteClient } from '@aparte/core';

const client = new AparteClient({
  keyResolver: (providerId) => process.env[providerId.toUpperCase() + '_KEY'],
});
client.start();
```

### `AparteClientOptions`

Constructor options (all optional):

| Option | Type | Purpose |
|---|---|---|
| `keyResolver` | `(providerId: string) => string \| Record<string,string> \| Promise<... \| undefined \| null> \| undefined \| null` | Resolve the API key/config for a provider. |
| `approvalResolver` | `AparteToolApprovalResolver` | Custom human-in-the-loop approval for `needsApproval` tools — receives the whole call `(call, signal)`, and may return an `instruction` (the user's words) or a `reason` (nobody spoke) the model reads on a refusal. Without one, the gate asks at the composer through `requestUserInput`, after consulting the `setApprovalPolicy()` policy if one is registered. With one, it owns the whole decision: the policy (and `@aparte/plugin-approval`'s modes) is not consulted at all. |
| `fileInjectFilter` | `(file: File) => boolean` | Decide which attached files are read and sent to the model. Return `false` to keep one out of the request — e.g. `(f) => !/(^\|\.)env$\|\.(pem\|key)$/i.test(f.name)`. Without one, every attachment is sent. |
| `streamRunner` | `AparteStreamRunner` | The loop runner — `@aparte/engine`'s `runStreamAgent` by default. Set it to wrap that loop's options (`(opts) => runStreamAgent({ ...opts, onHistoryAppend })`) or to replace it with a loop of your own emitting the same events. |
| `requestInterceptor` | `(request: AparteChatRequest) => AparteChatRequest \| Promise<AparteChatRequest>` | Modify the chat request before it is sent. |
| `autoRegister` | `boolean` (default `true`) | Register core's default segment renderers. Rarely needed either way — the built-ins install themselves on first use; set `false` (at startup) to keep them out and register your own. |
| `history` | `'viewport' \| 'none' \| ((viewportMessages: AparteMessage[]) => AparteChatMessage[])` | Conversation-history strategy for new sends. |
| `targetResolver` | `() => HTMLElement \| null` | Resolve the render target when the default event-bubble walk / DOM scan can't reach it. |
| `scopeToTargetId` | `string` | Scope this client instance to one target id, for multiple independent conversations on one page. |
| `maxTurns` | `number` (default `10`) | Max agentic tool-call loop turns before the loop is forcibly stopped. |
| `toolTimeoutMs` | `number` (default `300000` — 5 min) | Per-call ceiling for a tool handler to resolve before its `AbortSignal` fires. Same name and same default as `runStreamAgent`, so the value means one thing whichever loop runs. |
| `rawFileInject` | `'all' \| 'images-only' \| 'none'` (default `'all'`) | Which attached files are injected as raw content parts vs. left to the app layer (e.g. a RAG pipeline). |
| `config` | `AparteConfig` | The config instance this client reads. Defaults to `aparteGlobalConfig`. |

### Public methods

- `constructor(options: AparteClientOptions = {})`
- `start(): void` — attach the `aparte-send` / `aparte-abort` / `aparte-retry` / `aparte-edit` listeners on `window`. Nothing streams before this is called.
- `stop(): void` — remove all listeners.
- `abort(): void` — abort the current streaming response and all active tool calls; dispatches `aparte-message-aborted` on the target element.
- Compaction is not a method of the client any more: `@aparte/plugin-compaction`'s `setupCompaction()` answers `aparte-compact` and summarises through the same transport — see [the plugin](/plugins/compaction/).

### The turn lifecycle events

Dispatched on the target element (bubbling and composed), each stamped with the
host's `targetId` so several chats on one page stay isolated. All four are in the
typed event map, so `e.detail` is typed on an `<aparte-chat>` or a viewport — and,
since 0.8.0, under the `node` export condition too.

The four are `aparte-message-start`, `-done`, `-aborted` and `-error`. Their detail types and what each one
means are in the [events reference](/reference/events/#on-the-chat-host), which is
generated from the source — this page used to repeat them in a table of its own, and a
second copy of a list is a second copy to keep in step.

Use them for what the chat itself does not do: a progress bar, a token-cost meter,
analytics, or disabling an unrelated control while a turn is in flight.

```ts
// Typed because the event map is augmented — no cast needed on the element.
const chat = document.querySelector('aparte-chat')!;

chat.addEventListener('aparte-message-start', (e) => {
  console.log('turn started for', e.detail.messageId);
});

chat.addEventListener('aparte-message-done', (e) => {
  if (e.detail.usage) console.log('tokens', e.detail.usage.totalTokens);
});
```

## Transports

A transport decides **where** a chat request goes and **how** the API key is handled.
`aparteGlobalConfig.setTransport(...)` (default: `AparteDirectTransport`) wires one in.

- **`AparteDirectTransport`** (`packages/core/src/transport/direct-transport.ts`) — calls the vendor
  endpoint straight from the browser. The default; only safe for BYOK or local models. Options:
  `{ byok?: boolean }` — set `true` to silence the one-time insecure-key `console.warn`.
- **`AparteBackendTransport`** (`packages/core/src/transport/backend-transport.ts`) — POSTs
  `{ providerId, request }` to your own endpoint; the key never reaches the browser. Options:
  `{ endpoint: string; headers?: Record<string,string>; buildBody?: (request, providerId) => unknown }`.
- **`createAparteChatHandler(options)`** (`packages/core/src/transport/backend-handler.ts`) — builds
  the matching framework-free `/api/chat` handler (`(req: Request) => Promise<Response>`) for
  `AparteBackendTransport`: same `@aparte/provider-*` adapters, run server-side, key never leaves the server.

See the [Backend transport](/guides/backend-transport/) guide for the full walkthrough.
