---
'@aparte/core': minor
---

The chat's imperative API gains `getElement()`, the chat's root element, and `getComposer()`, its `<aparte-composer>`; every wrapper's chat implements both.

Do you have to touch your code? Only if a class of yours implements `AparteChatImperativeApi`: add `getElement()` and `getComposer()`.

- **Why.** An event core has no prop for — a plugin's (`aparte-subagent-open`, `aparte-artifact-open`) or your own — reaches the chat's root, because every part sends its events up to it. `getElement()` is that root, so each framework has one way to listen: `useAparteEvent(chat.ref, …)` in React, `@aparte-…` in Vue, `onaparte-…` in Svelte 5, `(aparte-…)` in Angular, `getElement()` in Svelte 4.
- **Same name as the proxy.** `AparteUiHandle` already calls its accessor `getElement()`.
