# @aparte/angular

Angular 19 wrapper for [aparté](https://github.com/apartejs/aparte) — an ergonomic `<aparte-chat>`
standalone component plus services (`AparteAiService`, `ConversationManagerService`) over the
framework-agnostic web components in `@aparte/core`.

```bash
npm install @aparte/angular @aparte/core @angular/core @angular/common rxjs
```

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
    <aparte-chat [messages]="messages" (messageSent)="onSend($event)" (messagesChange)="messages = $event">
      <p slot="empty-state">Ask me anything…</p>
    </aparte-chat>
  `,
})
export class Chat {
  messages: AparteMessage[] = [];
  onSend(e: { content: string; timestamp: number }) { /* … */ }
}
```

`@aparte/core`, `@angular/core`, `@angular/common` and `rxjs` are **peer dependencies**. For any
`<aparte-*>` element without a dedicated component, the generic `<aparte-ui name="aparte-…">` escape
hatch mounts it.

> ESM-only. See the docs for the full API. Part of the aparté monorepo.
