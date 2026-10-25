<script lang="ts">
  /** A page declaring cards: a context of its own, and an optional older declaration below. */
  import { setContext } from 'svelte';
  import AparteToolUI from '../../runes/AparteToolUI.svelte';
  import ToolCard from './ToolCard.svelte';

  let { lower = false, show = true }: { lower?: boolean; show?: boolean } = $props();
  setContext('theme', 'brass');
</script>

{#if lower}
  <AparteToolUI name="get_weather">
    {#snippet children()}<span class="lower"></span>{/snippet}
  </AparteToolUI>
{/if}
{#if show}
  <AparteToolUI name="get_weather">
    {#snippet children(tool)}<ToolCard tool={tool as never} />{/snippet}
  </AparteToolUI>
{/if}
