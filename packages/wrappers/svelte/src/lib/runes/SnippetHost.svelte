<script lang="ts" generics="V">
  /**
   * One snippet, drawn with one value — what `<AparteToolUI>` and `<AparteSegmentUI>` mount
   * into each element core hands them. Internal: not exported.
   */
  import type { Snippet } from 'svelte';

  let { snippet, value }: { snippet: Snippet<[V]>; value: V } = $props();
</script>

{@render snippet(value)}
