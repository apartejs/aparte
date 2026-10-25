<script lang="ts">
  import AparteChat from '../../runes/AparteChat.svelte';
  import type { AparteMessage } from '../../types.js';

  let { messages = [] }: { messages?: AparteMessage[] } = $props();
</script>

<AparteChat {messages}>
  {#snippet emptyState()}<p class="welcome">Ask me anything</p>{/snippet}
  {#snippet aboveComposer()}<div class="banner">banner</div>{/snippet}
  {#snippet toolbar()}<span class="hint">Shift + Enter</span>{/snippet}
  {#snippet bubble(message)}<div class="my-bubble" data-id={message.id}>{message.content}</div>{/snippet}
</AparteChat>
