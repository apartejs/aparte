<script lang="ts">
  import AparteChat from '../AparteChat.svelte';
  import type { AparteMessage } from '@aparte/core';
  export let messages: AparteMessage[] = [];
</script>

<AparteChat {messages}>
  <div slot="composer" class="my-custom-composer">custom</div>
</AparteChat>
