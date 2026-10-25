<script lang="ts">
  /** Creates the conversations the way a page does, and hands them to the test. */
  import { untrack } from 'svelte';
  import { createConversations, type AparteConversations } from '../../runes/index.js';

  let { onCreated }: { onCreated: (c: AparteConversations) => void } = $props();
  const conversations = createConversations();
  untrack(() => onCreated(conversations));
</script>
