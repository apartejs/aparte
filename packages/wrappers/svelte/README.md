# @aparte/svelte

Svelte wrapper for [aparté](https://github.com/apartejs/aparte) — an ergonomic `<AparteChat>`
component plus stores (`createAparteChat`, `createAparteClient`, `createConversationManager`) over the
framework-agnostic web components in `@aparte/core`.

**Svelte 4 and Svelte 5**, from the same source. The package ships its `.svelte` files
under the `svelte` export condition, so **your** compiler builds them — how a Svelte
component library is meant to be published, and the only arrangement that can serve two
majors: Svelte-4 output imports `svelte/internal`, which Svelte 5 removed, and Svelte-5
output does not run on 4. No prebuilt artifact works for both.

Both are exercised in a browser on every run: `apps/playgrounds/svelte` builds these
sources with Svelte 4, `apps/playgrounds/svelte5` with Svelte 5.

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
  on:messagesChange={(e) => chat.onMessagesChange(e.detail)}
/>
```

The user's message is appended automatically on send — don't add it yourself. `on:messageSent` is
optional and only for side-effects (scroll, analytics).

`@aparte/core` and `svelte` are **peer dependencies**. For any `<aparte-*>` element without a
dedicated component, the generic `<AparteUi name="aparte-…" />` escape hatch mounts it.

> ESM-only. See the docs for the full API. Part of the aparté monorepo.
