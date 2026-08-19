<script lang="ts">
  import AparteChat from '../AparteChat.svelte';
  import type { AparteMessage } from '@aparte/core';
  export let messages: AparteMessage[] = [];
  /** Set together with a custom composer, to prove the prop never reaches it. */
  export let attachments = false;
</script>

<AparteChat {messages} {attachments}>
  <div slot="composer" class="my-custom-composer">custom</div>
</AparteChat>
