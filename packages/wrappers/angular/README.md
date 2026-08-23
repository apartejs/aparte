# @aparte/angular

Angular 19 wrapper for [aparté](https://github.com/apartejs/aparte) — an ergonomic `<aparte-chat>`
standalone component plus services (`AparteAiService`, `ConversationManagerService`) over the
framework-agnostic web components in `@aparte/core`.

```bash
npm install @aparte/angular @aparte/core @angular/core @angular/common rxjs
```

<!-- doc-check: skip excerpt — `App` is the reader's root component, and @angular/platform-browser is theirs to install -->
```ts
// main.ts
import { bootstrapApplication } from '@angular/platform-browser';
import { provideAparte } from '@aparte/angular';

bootstrapApplication(App, {
  providers: [provideAparte({ clientOptions: {} })],
});
```

```ts
// chat.component.ts
import { Component } from '@angular/core';
import { AparteChatComponent, type AparteMessage } from '@aparte/angular';
import '@aparte/core/styles.css';

@Component({
  standalone: true,
  imports: [AparteChatComponent],
  template: `
    <aparte-chat (messagesChange)="messages = $event">
      <p slot="empty-state">Ask me anything…</p>
    </aparte-chat>
  `,
})
export class Chat {
  // The chat owns its thread; observe via (messagesChange). The user's message is
  // appended for you on send — don't push it back through [messages].
  messages: AparteMessage[] = [];
}
```

`@aparte/core`, `@angular/core`, `@angular/common` and `rxjs` are **peer dependencies**. For any
`<aparte-*>` element without a dedicated component, the generic `<aparte-ui name="aparte-…">` escape
hatch mounts it.

**On the Angular version.** The peer range is `^19.2.0`, and that is the only major this
package is built and browser-tested against. It is a thin bridge over standard custom
elements — no private Angular API, no `NgModule`, nothing the newer majors removed — so 20
through 22 will very likely work, and you can install it with `--legacy-peer-deps` or an
override if you want to try. But "very likely" is not something to encode in a peer range:
the sibling Svelte wrapper claims two majors because each one is compiled and driven in a
real browser in CI, and this one has no such example yet. Widening the range before the
proof exists would be a promise nobody here has checked.

> ESM-only. See the docs for the full API. Part of the aparté monorepo.
