<script lang="ts">
  /*
   * The chat as a Svelte 5 app writes it for an event core has no callback for:
   * `onaparte-test-plugin-event` on `<AparteChat>`, an event attribute that lands on the
   * chat's root element, where the event arrives.
   */
  import AparteChat from '../../runes/AparteChat.svelte';
  import type { AparteChatImperativeApi } from '@aparte/core';
  import type { AparteMessage } from '../../types.js';

  let { messages = [] }: { messages?: AparteMessage[] } = $props();
  let chat = $state<AparteChatImperativeApi>();
  let heard = $state.raw<CustomEvent[]>([]);

  export function api(): AparteChatImperativeApi | undefined { return chat; }
  export function events(): CustomEvent[] { return heard; }
</script>

<AparteChat
  bind:this={chat}
  {messages}
  onaparte-test-plugin-event={(event: CustomEvent<{ x: number }>) => (heard = [...heard, event])}
/>
