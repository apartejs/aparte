---
'@aparte/react': minor
---

New `useAparteEvent(ref, type, handler)` listens to an event `<AparteChat>` has no prop for — a plugin's `aparte-subagent-open`, or your own — and the chat's ref now has `getElement()` and `getComposer()`.

```tsx
const chat = useAparteChat();
useAparteEvent(chat.ref, 'aparte-subagent-open', (event) => openPanel(event.detail));
```

Do you have to touch your code? No. `UseAparteChat` now extends `AparteChatImperativeApi`, so it carries every method of it, these two included.

- **Typed.** The event is typed by `HTMLElementEventMap`, which every plugin package augments: `event.detail` needs no cast.
- **No resubscribe.** The latest handler is called; a new function takes no new subscription. It unsubscribes on unmount.
- **Where to call it.** In the component that renders the chat, so the ref is set when its effect runs. The target can also be an element.
