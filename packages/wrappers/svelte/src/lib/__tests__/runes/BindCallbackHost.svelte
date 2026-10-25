<script lang="ts">
  // bind:messages, and a callback that assigns the reported list as well: two proxies of it.
  import AparteChat from '../../runes/AparteChat.svelte';
  import type { AparteChatImperativeApi } from '@aparte/core';
  import type { AparteMessage } from '../../types.js';

  let messages = $state<AparteMessage[]>([]);
  let chat = $state<AparteChatImperativeApi>();

  export function current(): AparteMessage[] { return messages; }
  export function api(): AparteChatImperativeApi | undefined { return chat; }
</script>

<AparteChat bind:messages bind:this={chat} onmessagesChange={(l) => (messages = l)} />
