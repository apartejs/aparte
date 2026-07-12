---
title: "@aparte/core"
editUrl: false
---

# @aparte/core

<p align="center">
  <strong>Zero-Dependency Web Components for AI Chat Interfaces</strong>
</p>

<p align="center">
  <a href="#installation">Installation</a> •
  <a href="#components">Components</a> •
  <a href="#streaming">Streaming</a> •
  <a href="#configuration">Configuration</a> •
  <a href="#customization">Customization</a> •
  <a href="#theming">Theming</a> •
  <a href="#plugins">Plugins</a>
</p>

---

## Installation

```bash
npm install @aparte/core
```

```typescript
import '@aparte/core';                 // registers the <aparte-*> custom elements
import '@aparte/core/dist/index.css';  // theme variables + component styles
import { registerDefaultRenderers } from '@aparte/core';
registerDefaultRenderers();          // required (standalone) — bubbles render empty without it
```

## Components

### `<aparte-chat-viewport>`

**The Core** — Main container with smart scroll and message registry.

#### Attributes

| Attribute | Type | Default | Description |
|-----------|------|---------|-------------|
| `scroll-threshold` | number | `50` | Pixels from bottom to enable auto-scroll |
| `max-messages` | number | `1000` | Maximum messages in memory |

#### Methods

```typescript
viewport.appendMessage(message: AparteMessage): void  // creates the bubble in the DOM + registers it (standalone)
viewport.appendToken(messageId: string, chunk: string): void
viewport.addSegment(messageId: string, segment: AparteSegment): void
viewport.appendToSegment(messageId: string, segmentId: string, chunk: string): void
viewport.updateSegment(messageId: string, segmentId: string, updates: Partial<AparteSegment>): void
viewport.removeSegment(messageId: string, segmentId: string): void
viewport.completeMessage(messageId: string): void
viewport.addMessage(message: AparteMessage): void      // repository only — for framework-managed DOM (e.g. the Angular wrapper)
viewport.scrollToBottom(): void
viewport.clearMessages(): void
```

> **Rendering a message:** standalone consumers call `appendMessage()` (creates the bubble **and** registers the message). `addMessage()` only mutates the in-memory tree and is meant for framework bindings that own the DOM themselves (set via `setFrameworkManagedDOM(true)`). You also need `registerDefaultRenderers()` once at startup, or bubbles render empty.

#### Smart Scroll Behavior

- **Auto-sticks** to bottom when user is at bottom
- **Stops** when user scrolls up manually
- **Resumes** when user scrolls back to bottom

---

### `<aparte-chat-bubble>`

**The Render** — Message bubble with plugin system.

#### Attributes

| Attribute | Type | Description |
|-----------|------|-------------|
| `role` | `'user' \| 'assistant'` | Message sender role |
| `content` | string | Message text content |
| `timestamp` | number \| string | Unix timestamp or ISO string |
| `message-id` | string | Unique ID for streaming |

---

### `<aparte-chat-input>`

**The Interface** — Auto-expanding contenteditable input.

#### Attributes

| Attribute | Type | Default | Description |
|-----------|------|---------|-------------|
| `placeholder` | string | `'Type a message...'` | Placeholder text |
| `max-height` | number | `200` | Maximum height in px |
| `min-height` | number | `44` | Minimum height in px |
| `disabled` | boolean | `false` | Disable input |

#### Events

```typescript
input.addEventListener('aparte-send', (e: CustomEvent<AparteSendEventDetail>) => {
  console.log(e.detail.content);    // Message text
  console.log(e.detail.timestamp);  // Send timestamp
});
```

- **Enter** → Send message
- **Shift+Enter** → New line

---

### `<aparte-composer>`

**Headless context provider** — holds the value/streaming/attachments/panel state and imposes **no layout**. Compose the `aparte-composer-*` primitives (or your own controls) however you like.

#### Bring your own send button

Any element can drive the composer: call the public `submit()` / `cancel()` methods for the action, and listen to `aparte:composer-change` to mirror live state (or read it synchronously with `getState()`).

```typescript
const composer = document.querySelector('aparte-composer');
myButton.addEventListener('click', () => composer.submit());
composer.addEventListener('aparte:composer-change', (e: CustomEvent<AparteComposerChangeEventDetail>) => {
  const { streaming, disabled, value, attachments } = e.detail.state;
  myButton.disabled = disabled || (!value.trim() && attachments.length === 0);
  myButton.textContent = streaming ? 'Stop' : 'Send';
});
```

| Event | Detail | When |
|-------|--------|------|
| `aparte-send` | `AparteSendEventDetail` | A message is submitted |
| `aparte:cancel` | — | Streaming is cancelled |
| `aparte:composer-change` | `{ state, composer }` | Any observable state change |

---

### `<aparte-chat-status>`

**The Indicator** — Elegant typing animation.

#### Attributes

| Attribute | Type | Description |
|-----------|------|-------------|
| `visible` | boolean | Show/hide indicator |
| `text` | string | Custom text (default: "Typing") |
| `variant` | `'bounce' \| 'pulse' \| 'wave'` | Animation style |

---

## Streaming

```typescript
const viewport = document.querySelector('aparte-chat-viewport');
const msgId = crypto.randomUUID();

// 1. Create the assistant bubble first (standalone consumers).
viewport.appendMessage({ id: msgId, role: 'assistant', content: '', timestamp: Date.now(), status: 'streaming' });

// 2. Stream tokens into the existing bubble.
for await (const token of llmStream) {
  viewport.appendToken(msgId, token);
}

// 3. Mark complete.
viewport.completeMessage(msgId);
```

> Prefer letting `AparteClient` drive this loop — it streams typed segments (text/code/thinking/tool_call) from the provider into the bubble for you. The raw `appendToken` path is for custom transports.

> **Streamed text lands in `message.segments`, not `message.content`.** `AparteClient`
> splits the reply into typed segments as it streams, so `content` stays empty for
> streamed replies. If you render your own bubble (see below), read `message.segments`
> — each segment carries its own `content` — and fall back to `message.content` for
> seeded, non-streamed messages.

---

## Configuration

Aparte is zero-dependency by default but can be supercharged via the `AparteConfig` setters. You inject the renderer of your choice — the engine stays dependency-free.

```typescript
import { AparteConfig } from '@aparte/core';
import { marked } from 'marked';
import { codeToHtml } from 'shiki';

// Enable Markdown — one-shot renderer (raw) => string
AparteConfig.setMarkdownProvider((raw) => marked.parse(raw) as string);

// Enable Syntax Highlighting — sync OR async (code, lang) => string | Promise<string>
AparteConfig.setHighlightProvider((code, lang) => codeToHtml(code, { lang, theme: 'dracula' }));
```

Use a provider package (e.g. `@aparte/provider-openai-compat`) for AI backends, and the `setIconProvider` / `setSkeletonProvider` setters for icons and skeletons. See the [API Reference](/reference/api) for the full list of provider setters.

### Multiple chats on one page

`AparteConfig` is the **global** configuration — right for the common one-chat-per-app case. To run several independently configured chats on one page, attach an instance config to each chat's root element; every `<aparte-*>` component (including plugin elements like `<aparte-model-selector>`) resolves the nearest boundary and falls back to the global.

```typescript
import { AparteConfigClass, attachConfig } from '@aparte/core';

const supportConfig = new AparteConfigClass();
supportConfig.registerAIProvider(supportProvider);
supportConfig.setMarkdownProvider((md) => marked.parse(md) as string);

attachConfig(document.querySelector('#support-chat')!, supportConfig);
// Everything inside #support-chat now reads supportConfig;
// chats outside it keep using the global AparteConfig.
```

> An instance config is **isolated**, not layered: it starts from the built-in
> defaults and does **not** inherit providers registered on the global
> `AparteConfig` — register what each instance needs on that instance. Plugin
> *setup* functions (`setupDefaultSkeletons()`, `registerVoicePlugin()`, …)
> configure the global config by design.

---

## Customization

Every region — bubbles, the typing indicator, attachments, errors, actions — is
replaceable without forking. Register a render hook (`region → string | HTMLElement`),
listen for a public DOM event, or register a renderer by type:

```typescript
import { AparteConfig, registerSegmentRenderer } from '@aparte/core';

AparteConfig.setStatusRenderer((text) => `<div class="my-typing">${text}</div>`);
AparteConfig.setErrorRenderer(({ message }) => `<div class="my-error">${message}</div>`);
AparteConfig.setAttachmentRenderer((att) => `<div class="my-chip">${att.name}</div>`);
AparteConfig.registerBubbleAction({ id: 'share', icon: '<svg>…</svg>', label: 'Share' });
document.addEventListener('aparte:action', (e) => console.log(e.detail.actionId));
```

See **[CUSTOMIZATION.md](./CUSTOMIZATION.md)** for the full set of hooks
(`setStatusRenderer` · `setErrorRenderer` · `setAttachmentRenderer` ·
`setSiblingNavRenderer` · `setBubbleShellRenderer` · `setAvatarProvider` ·
segment renderers · `registerBubbleAction` / `aparte:action` · `thinkingDelimiters`),
the wrapper-level `renderBubble` / empty-state / composer slots, and the
"streamed text lives in `segments`" note.

---

## Theming

Aparte is **100% CSS-driven**. No JS theme logic - just override CSS variables. The
full variable reference (162 tokens, grouped) lives in **[THEMING.md](./THEMING.md)**.

### Light Mode (Default)

```css
:root {
  --aparte-primary: #6366f1;
  --aparte-bg: #ffffff;
  --aparte-text: #1f2937;
  --aparte-surface-1: #ffffff;   /* Bubbles */
  --aparte-surface-2: #f3f4f6;   /* Code blocks */
  --aparte-surface-3: #e5e7eb;   /* Skeletons */
  --aparte-border: #e5e7eb;
  
  /* Status */
  --aparte-info: #3b82f6;
  --aparte-success: #10b981;
  --aparte-error: #ef4444;
}
```

### Dark Mode

Use the `data-aparte-theme` attribute on any parent element:

```html
<div data-aparte-theme="dark">
  <aparte-chat-viewport>...</aparte-chat-viewport>
</div>
```

Custom dark values are built-in and activated by the attribute.

### System Preference (Optional)

If you want to follow the user's system preference, add this to **your app's CSS** (not in Aparte):

```css
@media (prefers-color-scheme: dark) {
  :root { 
    --aparte-bg: #0f172a;
    --aparte-text: #f1f5f9;
    /* ...override other vars */
  }
}
```

---

## Plugins

### Content Rendering (Markdown & Highlighting)

Message content is rendered through pluggable providers on `AparteConfig` — the
output always flows through the built-in HTML sanitizer:

```typescript
import { AparteConfig } from '@aparte/core';

// One-shot markdown (re-render on completion):
AparteConfig.setMarkdownProvider({ render: (md) => marked.parse(md) });
// Optional: token-by-token markdown while streaming:
AparteConfig.setStreamingMarkdownProvider(myStreamingRenderer);
// Code blocks:
AparteConfig.setHighlightProvider({ highlight: (code, lang) => shiki.codeToHtml(code, lang) });
```

Ready-made providers exist: `@aparte/provider-marked`,
`@aparte/provider-streaming-markdown`, `@aparte/provider-shiki`, and friends.

---

## TypeScript

Full type definitions included:

```typescript
import type {
  AparteMessage,
  AparteBubbleRole,
  AparteSendEventDetail,
  AparteContentParser,
  AparteViewportConfig,
  AparteInputConfig
} from '@aparte/core';
```

---

## Demo

```bash
npm run dev
```

Open `http://localhost:5173` for interactive demo.

---

## License

MIT
