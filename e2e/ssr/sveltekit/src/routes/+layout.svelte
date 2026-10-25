<script lang="ts">
  import type { Snippet } from 'svelte';
  import '@aparte/core/styles.css';

  let { children }: { children: Snippet } = $props();
</script>

{@render children()}
