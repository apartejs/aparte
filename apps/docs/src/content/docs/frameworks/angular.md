---
title: 'Angular AI chat component, standalone — @aparte/angular'
description: The @aparte/angular wrapper — an ergonomic <aparte-chat> standalone component plus services over the aparté web components.
sidebar:
  order: 5
  label: Angular
---

`@aparte/angular` wraps `@aparte/core` for Angular 19: an ergonomic [`<aparte-chat>`](/components/conversation/aparte-chat/) standalone
component, services for the client and conversations, a typed directive for every element, and a
generic `<aparte-ui>` escape hatch.

```bash
npm install @aparte/angular @aparte/core @angular/core @angular/common rxjs
npm install @aparte/provider-scenario   # the scripted model, for the first run below, with no key
```

`@aparte/core`, `@angular/core`, `@angular/common` and `rxjs` are **peer dependencies**.

:::note[On the server]
`provideAparte()` guards `autoConnect` with `typeof window !== 'undefined'`, so Angular Universal boots without touching the DOM. `@aparte/core` itself imports cleanly on a server through its DOM-free entry — see [On the server](/frameworks/elements/#on-the-server).
:::


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

The component projects **only** those four slots. Anything else you put inside
`<aparte-chat>` is discarded — Angular and Vue drop it at runtime, React and Svelte reject
it at compile time. For full control of the input row, project into `[slot='composer']`; to
compose the primitives yourself, build the container out of core's own elements — each has
a typed directive here, and [Add the markup](/guides/getting-started/#add-the-markup) shows
the shape.

Outputs: `messageSent`, `messagesChange`, `messageAppended`, `action`, `typingChange`,
`conversationCreated` — the same six on all four wrappers, with the payloads and the other
three syntaxes side by side in the generated
[Wrapper surface](/reference/wrappers/#callbacks). The imperative API (streaming, branch/edit, `scrollToBottom`,
`getViewport`) is on the component instance — grab it with a `@ViewChild`. `injectTokenStream`
takes the cross-wrapper `AsyncIterable<string>` — the exact call that works on React/Vue/Svelte —
**or** an RxJS `Observable<string>` (the Angular-idiomatic shape); everything else mirrors the
other wrappers.

## Wiring a real model

The wrapper is **provider-agnostic**. `provideAparte()` registers your providers and client options
at bootstrap **and starts the client** (`autoConnect`, on by default) — composer sends stream
replies with zero extra wiring.

Start with the scripted model: it needs no key and no network, and every line below is the
same for a real one.

```ts
import { AparteDirectTransport, aparteGlobalConfig } from '@aparte/core';
import { createScenarioProvider } from '@aparte/provider-scenario';
import { showcase } from '@aparte/provider-scenario/showcase';
import { provideAparte } from '@aparte/angular';

aparteGlobalConfig.setTransport(new AparteDirectTransport({ byok: true }));

// Pass this to bootstrapApplication's `providers` — no key, no network.
export const aparte = provideAparte({ providers: [createScenarioProvider({ scenarios: showcase })] });
```

Swap the provider for a real one and nothing else changes:

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

`provideAparte()` is Angular's DI idiom for that wiring, and it is **fully optional** — the
components work without it, and `aparteGlobalConfig.*` called directly does the same job.
React, Vue and Svelte have no equivalent because they need none: what this provider buys is
an initializer that runs before the first component and a `DestroyRef` for the theme
listener, and everywhere else the same handful of calls run at module scope — see
[`provideAparte` is Angular's, and only Angular's](/reference/wrappers/#provideaparte-is-angulars-and-only-angulars).
Its `plugins` slots
take **objects or loader functions** you supply, and `locale` takes an `AparteLocale` **object** (e.g.
`locale: fr` from `@aparte/locale-fr`) — none of them take package-name strings — so this package
stays a leaf with no plugin catalog. Pass a per-instance `[config]` to scope providers/transport to a
single `<aparte-chat>` instead of `aparteGlobalConfig`.

The full surface is `ProvideAparteOptions`, and its `plugins.actions` slot is a
code-splitting story the other three wrappers have no answer for: each entry is an
`ApartePluginLoader`, a `() => void | Promise<void>` you write, so wrapping a dynamic
`import()` puts the plugin in a chunk of its own and the app initializer awaits it before
the client connects.

```ts
import { AparteDirectTransport, aparteGlobalConfig } from '@aparte/core';
import { createOpenAICompatProvider, presets } from '@aparte/provider-openai-compat';
import { provideAparte } from '@aparte/angular';
import { fr } from '@aparte/locale-fr';

aparteGlobalConfig.setTransport(new AparteDirectTransport({ byok: true }));

export const aparte = provideAparte({
  providers: [createOpenAICompatProvider(presets.OPENROUTER)],
  plugins: {
    // Loaders, not package names: each is a chunk of its own, awaited before connect.
    // A loader resolves to nothing, so `await` the import instead of returning it.
    actions: [
      async () => {
        await import('@aparte/plugin-model-selector');
      },
      async () => {
        await import('@aparte/plugin-approval');
      },
    ],
    markdown: () => import('@aparte/plugin-marked').then((m) => m.setupMarkedProvider()),
  },
  modelConfig: { defaultProvider: 'openrouter', defaultModel: 'openai/gpt-4o-mini' },
  locale: fr,                 // an AparteLocale OBJECT, never a package-name string
  themeMode: 'auto',          // follows prefers-color-scheme, and keeps following it
  clientOptions: { maxTurns: 6 },
  autoConnect: true,          // the default; false hands you AparteAiService.connect()
});
```

The resolved options are available through `APARTE_CONFIG_TOKEN`, and the client's own
through `APARTE_CLIENT_OPTIONS`, for a service that needs to read what the app was
bootstrapped with.

:::note
`clientOptions` accepts the full `AparteClientOptions`. The loop is already
`@aparte/engine`'s `runStreamAgent` — there is nothing to inject to get it. `streamRunner`
is the seam for wrapping its options or replacing it with a loop of your own:
`provideAparte({ clientOptions: { streamRunner: (opts) => runStreamAgent({ ...opts, maxTurns: 4 }) } })` —
see [the `streamRunner` seam](/guides/engine/#the-streamrunner-seam). For file uploads add
`attachments` to `<aparte-chat>` (off by default) — see [Attachments](/guides/attachments/).
The `<aparte-elicitation>` presenter — what the built-in approval gate and `requestUserInput()`
ask through — renders inside the host **by default**, as in core's `<aparte-chat>`; bind
`[elicitation]="false"` when you register a presenter of your own. `class` and `style` on the
`<aparte-chat>` tag land on the component's host element, which is the sized box
(`display: block; height: 100%`), so utilities size the chat column as on any element; to reach
the container inside it, bind `[containerClass]` / `[containerStyle]` (below).
`provideAparte` wires the client, so switch the retry/edit buttons on with
`aparteGlobalConfig.setBubbleActions({ retry: true, edit: true })` — they ship off because without a
host they do nothing (see [What ships enabled](/guides/customization/#what-ships-enabled)).
:::

For a wait of your own — independent of what the client is doing, e.g. while your own store
is still answering — bind `[loading]`:

```html
<aparte-chat [loading]="isFetchingHistory"></aparte-chat>
```

See [the wrapper reference](/reference/wrappers/#props) for the same prop in React, Vue
and Svelte.

`[containerClass]` and `[containerStyle]` land on the **inner** `.aparte-chat-container` — the div
that also carries `[overlay-composer]` and `[data-aparte-empty]`, the selectors core's shell recipe
keys on. Angular is the only wrapper with a host element above that div, so these two inputs are
its spelling of React's `className` / `style` and of Vue's and Svelte's `class` / `style`. Both are
additive: the recipe's own classes stay, and `containerStyle` takes a string or a
`{ prop: value }` map.

```html
<aparte-chat
  [containerClass]="'rounded-2xl border'"
  [containerStyle]="{ 'max-inline-size': '48rem' }"
></aparte-chat>
```

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

The component behind the tag is `AparteUiComponent`; import it like `AparteChatComponent`.

## Also exported

- `ConversationManagerService` — signal-based view over the core `AparteConversationManager` (list /
  create / archive), for a multi-conversation sidebar.

## Testing it

Vitest, Karma — every runner — executes on Node, so `@aparte/core` resolves to its DOM-free
entry and no `<aparte-*>` element upgrades under jsdom: the tag stays a plain
`HTMLElement` and every assertion about it fails for a reason nothing explains. Alias the
specifier to [`@aparte/core/browser`](/frameworks/elements/#testing-your-components), the
entry with the elements in it.

## The whole thing, running

A complete chat site in Angular — the conversation sidebar, the header, the settings dialog,
markdown, highlighting, tools, and the scripted model — is in this repository:
[`apps/examples/angular`](https://github.com/apartejs/aparte/tree/main/apps/examples/angular). It
shares its setup with the vanilla, React, Vue and Svelte sites through
[`apps/examples/_shared`](https://github.com/apartejs/aparte/tree/main/apps/examples/_shared), so
the framework-specific part is three files: `src/app/app.component.ts`, the `main.ts` that
bootstraps it, and `scenario-mode.ts`, one injection token. Everything else is what an app
writes in any framework.
