<script lang="ts">
  import AparteChat from '../AparteChat.svelte';
  import type { AparteMessage } from '@aparte/core';
  export let messages: AparteMessage[] = [];
</script>

<AparteChat {messages}>
  <div slot="above-composer" class="above-banner">banner</div>
  <span slot="footer-left" class="fl">L</span>
  <span slot="footer-center" class="fc">C</span>
  <span slot="footer-right" class="fr">R</span>
</AparteChat>
