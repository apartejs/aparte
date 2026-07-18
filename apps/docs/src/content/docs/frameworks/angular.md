---
title: Angular
description: The @aparte/angular wrapper — an ergonomic <aparte-chat> standalone component plus services over the aparté web components.
sidebar:
  order: 5
---

`@aparte/angular` wraps `@aparte/core` for Angular 19: an ergonomic `<aparte-chat>` standalone
component, services for the client and conversations, and a generic `<aparte-ui>` escape hatch.

```bash
npm install @aparte/angular @aparte/core @angular/core @angular/common rxjs
```

`@aparte/core`, `@angular/core`, `@angular/common` and `rxjs` are **peer dependencies**.

## `<aparte-chat>`

The components are **standalone** — import them directly, no NgModule:

```ts
import { Component } from '@angular/core';
import { AparteChatComponent, type AparteMessage } from '@aparte/angular';
import '@aparte/core/styles.css';

@Component({
  standalone: true,
  imports: [AparteChatComponent],
  template: `
    <aparte-chat centerWhenEmpty (messagesChange)="messages = $event">
      <p slot="empty-state">Ask me anything…</p>
    </aparte-chat>
  `,
})
export class Chat {
  // The chat owns its thread. Observe it via (messagesChange) — do NOT push it
  // back through [messages]: the user's message is appended for you on send, so
  // re-adding it in a (messageSent) handler double-counts it.
  messages: AparteMessage[] = [];
}
```

Slots are **content projection** by attribute: `[slot='empty-state']`, `[slot='composer']`,
`[slot='above-composer']`, `[slot='footer-left'|'footer-center'|'footer-right']`. For a fully custom
bubble, pass a template instead:

```html
<aparte-chat [messages]="messages" [bubbleTemplate]="tpl"></aparte-chat>
<ng-template #tpl let-message>
  <div class="my-bubble">{{ message.content }}</div>
</ng-template>
```

Outputs: `messageSent`, `messagesChange`, `messageAppended`, `action`, `typingChange`,
`conversationCreated`. The imperative API (streaming, branch/edit, `scrollToBottom`,
`getViewport`) is on the component instance — grab it with a `@ViewChild`. `injectTokenStream`
takes the cross-wrapper `AsyncIterable<string>` — the exact call that works on React/Vue/Svelte —
**or** an RxJS `Observable<string>` (the Angular-idiomatic shape); everything else mirrors the
other wrappers.

## Wiring a real model

The wrapper is **provider-agnostic**. `provideAparte()` registers your providers and client options
at bootstrap **and starts the client** (`autoConnect`, on by default) — composer sends stream
replies with zero extra wiring:

```ts
// main.ts
import { bootstrapApplication } from '@angular/platform-browser';
import { DirectTransport, AparteConfig } from '@aparte/core';
import { createOpenAICompatProvider, presets } from '@aparte/provider-openai-compat';
import { provideAparte } from '@aparte/angular';

AparteConfig.setTransport(new DirectTransport({ byok: true }));

bootstrapApplication(App, {
  providers: [
    provideAparte({
      providers: [createOpenAICompatProvider(presets.OPENROUTER)],
      clientOptions: { /* AparteClientOptions */ },
    }),
  ],
});
```

That's it — no lifecycle wiring in your components. To own the client lifecycle yourself, pass
`autoConnect: false` and use the service:

```ts
// only with autoConnect: false — the manual escape hatch
import { inject } from '@angular/core';
import { AparteAiService } from '@aparte/angular';

export class Chat {
  private ai = inject(AparteAiService);
  ngOnInit() { this.ai.connect(); }   // idempotent — safe even if already connected
  ngOnDestroy() { this.ai.disconnect(); }
}
```

`provideAparte()` is **config sugar and fully optional** — the components work without it, and you
can call `AparteConfig.*` directly exactly like the React/Vue/Svelte wrappers do. Its `plugins` /
`locale` slots take **objects or loader functions** you supply (e.g.
`locale: fr` from `@aparte/locale-fr`), never package-name strings — so this package stays a leaf
with no plugin catalog. Pass a per-instance `[config]` to scope providers/transport to a single
`<aparte-chat>` instead of the global `AparteConfig`.

:::note
`clientOptions` accepts the full `AparteClientOptions`. To drive the chat with the **standalone
agent loop** instead of core's inline one, inject it:
`provideAparte({ clientOptions: { streamRunner: runStreamAgent } })` from
[`@aparte/engine`](/guides/engine/) — an optional swap-in, not required. File uploads work through
the composer — see [Attachments](/guides/attachments/).
:::

## Any element: `<aparte-ui>`

For an `<aparte-*>` element without a dedicated component, mount it generically. It forwards the
interactive aparté events by default; pass `[events]` to listen to others:

```html
<aparte-ui
  name="aparte-chat-input"
  [props]="{ placeholder: 'Ask…', '--glow-speed': '4s' }"
  (elementEvent)="onEvent($event)"
/>
```

## Also exported

- `ConversationManagerService` — signal-based view over the core `ConversationManager` (list /
  create / archive), for a multi-conversation sidebar.
