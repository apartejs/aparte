<script lang="ts" generics="T extends AparteSegmentBase">
  /**
   * Your own Svelte component for a segment type — one your stream emits, or a built-in such
   * as `code`. Mounted into each segment like `<AparteToolUI>`; taking the last declaration off
   * a built-in type gives it back to core's renderer.
   */
  import { getAllContexts, untrack, type Snippet } from 'svelte';
  import { defineMountedSegmentRenderer, overrideSegmentRenderer } from '@aparte/core';
  import type { AparteConfig, AparteSegmentBase } from '@aparte/core';
  import { mountSnippet } from './mount-snippet.svelte.js';

  let {
    type,
    config,
    children,
  }: {
    /** The segment `type` this draws. */
    type: T['type'];
    /** The config to declare it on. Defaults to the global one. */
    config?: AparteConfig;
    /** What to draw for one segment, handed its latest state. */
    children: Snippet<[T]>;
  } = $props();

  const context = getAllContexts();

  $effect(() => {
    const segmentType = type;
    const target = config;
    return untrack(() => {
      const renderer = defineMountedSegmentRenderer<T>(segmentType, (host, segment) => mountSnippet(host, () => children, segment, context));
      return target ? overrideSegmentRenderer(renderer, target) : overrideSegmentRenderer(renderer);
    });
  });
</script>
