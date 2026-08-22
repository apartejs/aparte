---
title: AparteConfig & core API
description: The core JS API in one place — the AparteConfig singleton, AparteClient, and the transports — signatures straight from packages/core/src.
sidebar:
  order: 4
---

The [Elements](/reference/api/), [CSS variables](/reference/css-variables/) and
[`@aparte/engine`](/reference/engine/) pages are generated references for those surfaces.
This page is the companion for the single biggest surface that has none: the **core JS
API** — `AparteConfig`, `AparteClient`, and the transports. Every signature below is
copied from `packages/core/src`; where a type is complex it is simplified for
readability without changing its meaning — follow the source links for the full shape.

## `AparteConfig`

`AparteConfig` is a global **singleton** instance of the `AparteConfigClass`
(`packages/core/src/config/aparte-config.ts`) — the "Invisible but Flexible" dependency-injection
hub. Everything below is a method on it, e.g. `AparteConfig.registerAIProvider(...)`.

```ts
import { AparteConfig } from '@aparte/core';
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
- `setArtifactPreviewBuilder(builder: AparteArtifactPreviewBuilder): void` / `getArtifactPreviewBuilder(): AparteArtifactPreviewBuilder | undefined` — builds the `srcdoc` HTML for an artifact preview iframe.

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
- `setHtmlSanitizer(sanitizer: AparteSanitizer | null): void` — replace the built-in allowlist sanitizer, or pass `null` to disable it (trusted content only).
- `sanitizeHtml(html: string): string` — run the active sanitizer over provider-produced HTML.

### System prompt

- `setSystemPrompt(template: string | undefined): void` — set the system-prompt template (`{{key}}` placeholders).
- `getSystemPromptTemplate(): string | undefined` — the raw template, unresolved.
- `setSystemPromptVarsProvider(fn: AparteSystemPromptVarsProvider): void` — a function returning the `{{key}}` → value map, called at request time.
- `resolveSystemPrompt(): string | null` — the template with all placeholders substituted, or `null` if none is set.

### Locale

Translatable UI strings (composer placeholder, Copy/Retry buttons, "thinking…", etc.).
English ships in core as `APARTE_DEFAULT_LOCALE`; other languages are injected.

- `setLocale(locale: AparteLocale): void` — replace the active locale.
- `getLocale(): AparteLocale` — the active locale.
- `extendLocale(translations: Partial<AparteLocale>): void` — merge partial translations onto the current locale (e.g. for a plugin registering its own strings).
- `t(key: keyof AparteLocale): string` — look up a translated string, falling back to `APARTE_DEFAULT_LOCALE`.

See the [Localization](/guides/localization/) guide.

### Icons & skeleton

- `setIconProvider(provider: AparteIconProvider): void` — a set of icon functions (`() => string` HTML each), e.g. a FontAwesome bridge.
- `getIconProvider(): AparteIconProvider` — the registered provider, or a fallback built from `APARTE_DEFAULT_ICON_FALLBACKS`.
- `getIcon(name: AparteIconName): string` — HTML for one icon by name, falling back to the built-in default.
- `setSkeletonProvider(provider: AparteSkeletonProvider): void` — a custom loading-state generator (`getSkeleton(type) => string`).
- `getSkeleton(type: AparteSkeletonType): string` — skeleton HTML for a type (`message` / `code` / `thinking` / `input` / `list` / `text`), via the provider or a minimal built-in fallback.

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

- `setHostHandlers(config: AparteHostHandlersConfig): void` — declare `attachmentPreview` (image tiles ask for a lightbox via `aparte-attachment-preview`), `terminalRun` (the Run button on a terminal segment → `aparte-terminal-run`), and/or `artifactRedownload` (the download button on a **binary** artifact → `aparte-artifact-redownload`). All default to `false`.
- `getHostHandlers(): { attachmentPreview, terminalRun, artifactRedownload }` — the resolved declarations.
- `APARTE_DEFAULT_HOST_HANDLERS` — the shipped defaults (nothing declared).

See the [Customization](/guides/customization/) guide.

### Tools & tool renderers

- `registerTool(tool: AparteTool, handler: AparteToolHandler): void` — register a tool definition together with its handler.
- `unregisterTool(name: string): void` — remove a tool by name.
- `getTools(): AparteTool[]` — all registered tool definitions (passed in the chat request).
- `getToolHandler(name: string): AparteToolHandler | undefined` — the handler for a tool by name.
- `registerToolRenderer(toolName: string, renderer: AparteToolRenderer): void` — a per-tool segment renderer, controlling what appears in the bubble when that tool is called.
- `unregisterToolRenderer(toolName: string): void` — remove a per-tool renderer.
- `getToolRenderer(toolName: string): AparteToolRenderer | undefined` — the renderer for a tool name, if any.

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
- `requestUserInput(request: AparteElicitationRequest): Promise<AparteElicitationResult>` — ask the user for typed input mid-run; resolves `{ action: 'accept' | 'decline' | 'cancel', ... }`. Resolves `cancel` immediately when no presenter is registered.

### Subscribe & reset

- `subscribe(callback: () => void): () => void` — subscribe to configuration changes; returns an unsubscribe function.
- `reset(): void` — reset **all** configuration back to defaults (providers, tools, tool renderers, model selection, actions, renderers, locale, sanitizer, bubble-actions config). Useful between SPA navigations / test cases so registries don't leak.

## `AparteClient`

`AparteClient` (`packages/core/src/client/aparte-client.ts`) is "the automatic transmission for
aparté" — it listens for `aparte-send` (and `aparte-retry`/`aparte-edit`/`aparte-abort`/`aparte-compact`)
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
| `approvalResolver` | `AparteToolApprovalResolver` | Custom human-in-the-loop approval for `needsApproval` tools. Defaults to a global `aparte-tool-decision` DOM listener. |
| `compactionSelector` | `AparteCompactionSelector` | Decide which messages `compact()` summarizes away vs. keeps verbatim. Default: drop everything. |
| `streamRunner` | `AparteStreamRunner` | Delegate the agentic loop to a headless runner (e.g. `@aparte/engine`'s `runStreamAgent`) instead of the built-in inline loop. |
| `requestInterceptor` | `(request: AparteChatRequest) => AparteChatRequest \| Promise<AparteChatRequest>` | Modify the chat request before it is sent. |
| `autoRegister` | `boolean` (default `true`) | Register core's default segment renderers. Rarely needed either way — the built-ins install themselves on first use; set `false` (at startup) to keep them out and register your own. |
| `history` | `'viewport' \| 'none' \| ((viewportMessages: AparteMessage[]) => AparteChatMessage[])` | Conversation-history strategy for new sends. |
| `targetResolver` | `() => HTMLElement \| null` | Resolve the render target when the default event-bubble walk / DOM scan can't reach it. |
| `scopeToTargetId` | `string` | Scope this client instance to one target id, for multiple independent conversations on one page. |
| `maxTurns` | `number` (default `10`) | Max agentic tool-call loop turns before the loop is forcibly stopped. |
| `rawFileInject` | `'all' \| 'images-only' \| 'none'` (default `'all'`) | Which attached files are injected as raw content parts vs. left to the app layer (e.g. a RAG pipeline). |
| `config` | `AparteConfigClass` | The config instance this client reads. Defaults to the global `AparteConfig`. |

### Public methods

- `constructor(options: AparteClientOptions = {})`
- `start(): void` — attach the `aparte-send` / `aparte-abort` / `aparte-compact` / `aparte-retry` / `aparte-edit` listeners on `window`. Nothing streams before this is called.
- `stop(): void` — remove all listeners.
- `abort(): void` — abort the current streaming response and all active tool calls; dispatches `aparte-message-aborted` on the target element.
- `compact(): Promise<void>` — summarize the conversation via the configured provider/model, clear the viewport, and inject the summary (dispatches `aparte-compact-start` / `aparte-compact-done` / `aparte-compact-error` on `window`).

## Transports

A transport decides **where** a chat request goes and **how** the API key is handled.
`AparteConfig.setTransport(...)` (default: `AparteDirectTransport`) wires one in.

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
