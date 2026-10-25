<script lang="ts">
  // The controlled pattern without bind: the parent keeps the list in its own deep $state and
  // writes back what the chat reports. Its write wraps the list in a proxy of its own.
  import AparteChat from '../../runes/AparteChat.svelte';
  import type { AparteChatImperativeApi } from '@aparte/core';
  import type { AparteMessage } from '../../types.js';

  let msgs = $state<AparteMessage[]>([]);
  let chat = $state<AparteChatImperativeApi>();

  export function current(): AparteMessage[] { return msgs; }
  export function api(): AparteChatImperativeApi | undefined { return chat; }
  export function write(next: AparteMessage[]) { msgs = next; }
</script>

<AparteChat bind:this={chat} messages={msgs} onmessagesChange={(l) => (msgs = l)} />
