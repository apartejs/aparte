---
'@aparte/svelte': minor
---

Both `<AparteChat>` components expose `getElement()` and `getComposer()`, and the Svelte 5 one sets any `onaparte-*` attribute on its root, so a plugin's event is `onaparte-subagent-open={…}`.

```svelte
<AparteChat onaparte-subagent-open={(event) => openPanel(event.detail)} />
```

Do you have to touch your code? No. `AparteChatStore` (`createAparteChat()`) now extends `AparteChatImperativeApi`, so it carries every method of it.

- **Svelte 5.** What the component does not declare is spread on its root element, the chat's own callbacks excepted. The `onaparte-*` attributes are typed by `HTMLElementEventMap`, with an open `onaparte-${string}` for the rest.
- **Svelte 4.** `bind:this` the chat, then `getElement()?.addEventListener(…)` in `onMount`.
