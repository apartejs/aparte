<script lang="ts">
  // A chat whose `config` the page replaces.
  import AparteChat from '../../runes/AparteChat.svelte';
  import type { AparteChatImperativeApi, AparteConfig } from '@aparte/core';

  let { config }: { config: AparteConfig } = $props();
  let chat = $state<AparteChatImperativeApi>();
  export function api(): AparteChatImperativeApi | undefined { return chat; }
</script>

<AparteChat bind:this={chat} id="chat-c" {config} />
