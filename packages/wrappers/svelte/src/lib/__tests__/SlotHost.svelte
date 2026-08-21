<script lang="ts">
  import AparteChat from '../AparteChat.svelte';
  import type { AparteMessage } from '@aparte/core';
  export let messages: AparteMessage[] = [];
</script>

<AparteChat {messages}>
  <div slot="above-composer" class="above-banner">banner</div>
  <!-- `svelte:fragment` projects both nodes with no wrapper element, so the row's own
       flex layout positions them -- the same shape as the React prop and the Vue slot,
       and the idiom the docs teach. -->
  <svelte:fragment slot="toolbar">
    <span class="mode">mode</span>
    <span class="model" style="margin-inline-start:auto">model</span>
  </svelte:fragment>
</AparteChat>
