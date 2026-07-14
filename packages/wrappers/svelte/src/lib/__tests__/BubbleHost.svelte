<script lang="ts">
  import AparteChat from '../AparteChat.svelte';
  import type { AparteMessage } from '@aparte/core';
  export let messages: AparteMessage[] = [];
</script>

<AparteChat {messages}>
  <div slot="bubble" let:message class="my-bubble" data-id={message.id}>{message.content}</div>
</AparteChat>
