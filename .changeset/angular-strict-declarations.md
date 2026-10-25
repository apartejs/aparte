---
'@aparte/angular': patch
---

The published types keep `null` and `undefined` again: `[conversationId]="id()"` with a `string | null` signal now compiles under `strictTemplates`.

**Code written against the old, wrong types may need a null check:** on the conversation service, `activeConversation()` is `AparteConversation | null` and `activeId()` is `string | null`; on the chat, `bubbleDirective()` can be `undefined`. The runtime always returned those.

The package was built with ng-packagr's built-in tsconfig, which sets no `strict`, so the declarations were emitted without `strictNullChecks` and every inferred `null` / `undefined` vanished: `conversationId`, `typingText`, `config`, `containerClass`, `containerStyle`, the `config` of both tool directives. The build now passes `-c tsconfig.lib.json`, which is ng-packagr's own options plus `strict`: the emitted JavaScript is byte for byte the same, only the declarations change. The Angular SSR fixture binds those inputs to nullable signals under `strictTemplates`, so a build that drops them again fails CI. Reported in #124.
