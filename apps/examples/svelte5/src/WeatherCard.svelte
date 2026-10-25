<script lang="ts">
  import { getContext, onDestroy, onMount } from 'svelte';
  import type { AparteToolCallView } from '@aparte/svelte/runes';
  import { noteCardMounted, noteCardUnmounted, weatherLine } from '../../_shared/framework-card';

  let { tool }: { tool: AparteToolCallView } = $props();
  // Set by `FrameworkWeatherCard.svelte`, around the declaration.
  const site = getContext<string>('siteName') ?? '';
  onMount(noteCardMounted);
  onDestroy(noteCardUnmounted);
</script>

<div class="framework-card" data-testid="framework-weather-card">
  {weatherLine(tool)} <small>· {site}</small>
</div>
