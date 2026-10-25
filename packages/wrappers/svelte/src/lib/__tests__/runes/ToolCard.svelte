<script lang="ts">
  import { getContext, onDestroy } from 'svelte';
  import type { AparteToolCallView } from '@aparte/core';
  import { counters } from './tool-ui-counters.js';

  let { tool }: { tool: AparteToolCallView<{ city: string }> } = $props();
  const theme = getContext<string | undefined>('theme') ?? 'none';
  const instance = ++counters.mounts;
  onDestroy(() => { counters.unmounts++; });
</script>

<span class="weather" data-theme={theme} data-instance={instance}>{tool.input.city}:{tool.status}</span>
