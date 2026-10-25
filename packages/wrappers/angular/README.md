# @aparte/angular

The **Angular AI chat component** of [aparté](https://github.com/apartejs/aparte) — an ergonomic
`<aparte-chat>` standalone component (Angular 19.2 to 21, zone or zoneless) plus services (`AparteAiService`, `ConversationManagerService`) over the
framework-agnostic web components in `@aparte/core`.

Tested in CI with Angular 19 and 21, zoneless, and in an Angular 21 SSR app rendered on the server
and hydrated with no mismatch — no `@defer` needed. `<ng-template aparteToolUI="…" let-tool>`
draws a tool call with your own components, injected from where you declare it.

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

`@aparte/core`, `@angular/core`, `@angular/common` and `rxjs` are **peer dependencies**.

Every `<aparte-*>` element has a **standalone directive** whose selector is the tag — typed `@Input()`s
that write attributes, one typed `@Output()` per event, and no `CUSTOM_ELEMENTS_SCHEMA` in your
component. Import what you use or `APARTE_ELEMENT_DIRECTIVES` for all of them.
`<aparte-ui name="my-widget">` remains for an element aparté does not define.

**On the Angular version.** The peer range is `^19.2.0 || ^20.0.0 || ^21.0.0`, and each
end of it is proven rather than assumed. The package is compiled on 19.2, its oldest major,
in Angular's partial mode, which Angular guarantees a newer app can link; its specs run on
19, under zone.js and zoneless, and in a server render. The repo's Angular example runs on
21, zoneless, and is driven in a real browser by the end-to-end suite. 20 sits between two
proven majors. Angular 22 is not in the range yet: it joins when it is driven the same way,
not before — a peer range is a promise, and this one only promises what has been run.

> ESM-only. See the docs for the full API. Part of the aparté monorepo.
