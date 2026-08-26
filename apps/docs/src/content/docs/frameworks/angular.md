---
title: Angular
description: The @aparte/angular wrapper — an ergonomic <aparte-chat> standalone component plus services over the aparté web components.
sidebar:
  order: 5
---

`@aparte/angular` wraps `@aparte/core` for Angular 19: an ergonomic [`<aparte-chat>`](/components/conversation/aparte-chat/) standalone
component, services for the client and conversations, a typed directive for every element, and a
generic `<aparte-ui>` escape hatch.

```bash
npm install @aparte/angular @aparte/core @angular/core @angular/common rxjs
```

`@aparte/core`, `@angular/core`, `@angular/common` and `rxjs` are **peer dependencies**.

:::caution[Angular 19 only, deliberately]
The peer range is `^19.2.0` because 19 is the only major this wrapper is built and
browser-tested against. It is a thin bridge over standard custom elements — no private
Angular API, no `NgModule` — so 20 through 22 will very likely work, and an override or
`--legacy-peer-deps` will let you try. We do not widen the range on "very likely":
[`@aparte/svelte`](/frameworks/svelte/) claims two majors because each is compiled and
driven in a real browser in CI, and Angular has no second example yet. Tell us if you
need a newer major — that is what would justify building one.
:::

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
`[slot='above-composer']`, `[slot='toolbar']` — the last one being the composer's bottom
row, with an example under
[The composer toolbar](/guides/customization/#the-composer-toolbar). For a fully custom
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

<!-- doc-check: skip excerpt — `App` is the reader's root component, and @angular/platform-browser is theirs to install -->
```ts
// main.ts
import { bootstrapApplication } from '@angular/platform-browser';
import { AparteDirectTransport, aparteGlobalConfig } from '@aparte/core';
import { createOpenAICompatProvider, presets } from '@aparte/provider-openai-compat';
import { provideAparte } from '@aparte/angular';

aparteGlobalConfig.setTransport(new AparteDirectTransport({ byok: true }));

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
can call `aparteGlobalConfig.*` directly exactly like the React/Vue/Svelte wrappers do. Its `plugins` slots
take **objects or loader functions** you supply, and `locale` takes an `AparteLocale` **object** (e.g.
`locale: fr` from `@aparte/locale-fr`) — none of them take package-name strings — so this package
stays a leaf with no plugin catalog. Pass a per-instance `[config]` to scope providers/transport to a
single `<aparte-chat>` instead of `aparteGlobalConfig`.

:::note
`clientOptions` accepts the full `AparteClientOptions`. To drive the chat with the **standalone
agent loop** instead of core's inline one, inject it:
`provideAparte({ clientOptions: { streamRunner: runStreamAgent } })` from
[`@aparte/engine`](/guides/engine/) — an optional swap-in, not required. For file uploads add
`attachments` to `<aparte-chat>` (off by default) — see [Attachments](/guides/attachments/).
`provideAparte` wires the client, so switch the retry/edit buttons on with
`aparteGlobalConfig.setBubbleActions({ retry: true, edit: true })` — they ship off because without a
host they do nothing (see [What ships enabled](/guides/customization/#what-ships-enabled)).
:::

## Any aparté element: a typed directive

Every element has a standalone directive whose selector is the tag, so you write the real element
with typed Inputs and one Output per event — and **no `CUSTOM_ELEMENTS_SCHEMA`**, which would switch
template checking off for every unknown tag in the file. Import the ones you use, or
`APARTE_ELEMENT_DIRECTIVES` for all of them:

```ts
import { AparteSelectDirective } from '@aparte/angular';
// then: @Component({ imports: [AparteSelectDirective], … })
```

```html
@if (showPicker) {
  <aparte-select
    [searchable]="true"
    placeholder="Pick a model"
    (selectChange)="use($event.value)"
  ></aparte-select>
}
```

The `@if` is the point: the element is really in the template, so control flow and content
projection reach it. Full set and the rules on
[Placing elements, typed](/frameworks/elements/).

:::note[An element from a plugin, or one of your own]
This typing covers `@aparte/core`'s elements — the ones the wrapper depends on. An element
from a plugin (`aparte-model-selector`, from
[`@aparte/plugin-model-selector`](/plugins/model-selector/)) or one of your own is typed by
**whoever owns it**, never by us: a third-party plugin's author cannot add a line to core,
so shipping typing for our own plugins would privilege our packages over theirs.

See [your own element](/frameworks/elements/#your-own-element-or-a-plugins) for the two
mechanisms — both are the same amount of work for us as for you.
:::

## Any OTHER element: `<aparte-ui>`

For an element aparté does not define — one of yours, or a third party's — mount it generically. It
forwards the interactive aparté events by default; pass `[events]` to listen to others:

```html
<aparte-ui
  name="my-token-counter"
  [props]="{ 'data-budget': '8000', '--glow-speed': '4s' }"
  (elementEvent)="onEvent($event)"
/>
```

This used to be how you placed a model selector. It still works, and it is still the only way to
mount a tag aparté knows nothing about — but for aparté's own elements the directive above gives you
type checking, one output per event, and an element the template can actually wrap.

## Also exported

- `ConversationManagerService` — signal-based view over the core `AparteConversationManager` (list /
  create / archive), for a multi-conversation sidebar.
