# @aparte/svelte

The **Svelte AI chat component** of [aparté](https://github.com/apartejs/aparte) — an ergonomic
`<AparteChat>` (Svelte 4 and 5) plus stores (`createAparteChat`, `createAparteClient`, `createConversationManager`) over the
framework-agnostic web components in `@aparte/core`.

**Svelte 4 and Svelte 5**, from the same source. The package ships its `.svelte` files
under the `svelte` export condition, so **your** compiler builds them — how a Svelte
component library is meant to be published, and the only arrangement that can serve two
majors: Svelte-4 output imports `svelte/internal`, which Svelte 5 removed, and Svelte-5
output does not run on 4. No prebuilt artifact works for both.

Both are exercised in a browser on every run: `apps/examples/svelte4` builds these
sources with Svelte 4, `apps/examples/svelte5` with Svelte 5.

One thing differs between the two, and it is in YOUR entry point rather than here:
Svelte 5 removed the class-instantiation API, so you write `mount(App, …)` instead of
`new App(…)`.

```bash
npm install @aparte/svelte @aparte/core svelte
```

```svelte
<script lang="ts">
  import { AparteChat, createAparteChat, type AparteChatImperativeApi } from '@aparte/svelte';
  import '@aparte/core/styles.css';

  const chat = createAparteChat();
  const { messages } = chat;
  let comp: AparteChatImperativeApi | null = null;
  $: chat.connect(comp);
</script>

<AparteChat
  bind:this={comp}
  messages={$messages}
  onmessagesChange={(m) => chat.onMessagesChange(m)}
/>
```

The user's message is appended automatically on send — don't add it yourself. `onmessageSent` is
optional and only for side-effects (scroll, analytics). Every callback prop also exists as a component
event (`on:messagesChange`, payload under `event.detail`) — the Svelte 4 spelling, still fine on Svelte 5.

`@aparte/core` and `svelte` are **peer dependencies**.

Every `<aparte-*>` tag is declared through `SvelteHTMLElements`, so `svelte-check` covers its
attributes and its `on:` handlers. `<AparteUi name="my-widget" />` remains for an element aparté does
not define.

> ESM-only. See the docs for the full API. Part of the aparté monorepo.
