<script lang="ts">
  import AparteChat from '../AparteChat.svelte';
  import type { AparteMessage } from '@aparte/core';
  export let messages: AparteMessage[] = [];
</script>

<AparteChat {messages}>
  <div slot="above-composer" class="above-banner">banner</div>
  <div slot="toolbar" class="toolbar-content">
    <span class="mode">mode</span>
    <span class="model" style="margin-inline-start:auto">model</span>
  </div>
</AparteChat>
