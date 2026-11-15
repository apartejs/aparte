<script lang="ts">
  /*
   * The Svelte 4 way to hear an event core has no `on:` for — a plugin's: `bind:this` the chat,
   * then `getElement()` and `addEventListener` once it is mounted. `heard` is what arrived.
   */
  import { onMount, onDestroy } from 'svelte';
  import AparteChat from '../AparteChat.svelte';
  import type { AparteMessage } from '../types.js';

  export let messages: AparteMessage[] = [];
  let heard: CustomEvent[] = [];
  let chat: AparteChat;
  let off: (() => void) | undefined;

  export function instance(): AparteChat { return chat; }
  export function events(): CustomEvent[] { return heard; }

  onMount(() => {
    const root = chat.getElement();
    const listener = (event: Event) => { heard = [...heard, event as CustomEvent]; };
    root?.addEventListener('aparte-test-plugin-event', listener);
    off = () => root?.removeEventListener('aparte-test-plugin-event', listener);
  });
  onDestroy(() => off?.());
</script>

<AparteChat bind:this={chat} {messages} />
