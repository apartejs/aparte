<script lang="ts">
  import AparteChat from '../../runes/AparteChat.svelte';
  import type { AparteChatImperativeApi } from '@aparte/core';
  import type { AparteMessage } from '../../types.js';

  let { initial = [], onSent }: { initial?: AparteMessage[]; onSent?: (content: string) => void } = $props();
  // svelte-ignore state_referenced_locally
  let messages = $state<AparteMessage[]>(initial);
  let chat = $state<AparteChatImperativeApi>();

  export function current(): AparteMessage[] { return messages; }
  export function api(): AparteChatImperativeApi | undefined { return chat; }
  export function write(next: AparteMessage[]) { messages = next; }
  export function push(m: AparteMessage) { messages.push(m); }
</script>

<AparteChat bind:messages bind:this={chat} onmessageSent={(d) => onSent?.(d.content)} />
