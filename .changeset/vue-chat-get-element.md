---
'@aparte/vue': minor
---

`<AparteChat>` exposes `getElement()` and `getComposer()`, and `@aparte-some-event` on it hears a plugin's event; `useAparteChat()` returns both too.

```vue
<AparteChat @aparte-subagent-open="openPanel($event.detail)" />
```

Do you have to touch your code? No. `useAparteChat`'s return type is now the exported `UseAparteChat`, which extends `AparteChatImperativeApi`.

- **How.** An event the chat does not declare as an emit falls through to its root element, where every event of the chat arrives; a test pins it.
