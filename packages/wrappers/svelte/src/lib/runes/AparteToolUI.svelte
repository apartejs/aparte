<script lang="ts" generics="I = unknown, R = unknown">
  /**
   * Your own Svelte component in a tool call.
   *
   * `<AparteToolUI name="get_weather">{#snippet children(tool)}<WeatherCard {tool} />{/snippet}</AparteToolUI>`
   * draws every `get_weather` call with your snippet for as long as it is mounted, and gives the
   * calls back to core's row when it unmounts. The snippet is mounted with the contexts of where
   * you put the declaration, so `getContext` reads what your app set there.
   *
   * Underneath it is core's `overrideToolRenderer` + `defineMountedToolRenderer`. Nothing is
   * declared in a server render (`$effect` runs in the browser only); the cards are drawn there.
   */
  import { getAllContexts, untrack, type Snippet } from 'svelte';
  import { aparteGlobalConfig, defineMountedToolRenderer } from '@aparte/core';
  import type { AparteConfig, AparteToolCallView, AparteToolMatcher } from '@aparte/core';
  import { mountSnippet } from './mount-snippet.svelte.js';

  let {
    name,
    config,
    children,
  }: {
    /** The tool this draws: a name, a `RegExp`, or `'*'` for every tool. */
    name: AparteToolMatcher;
    /** The config to declare it on. Defaults to the global one. */
    config?: AparteConfig;
    /** What to draw for one call: its id, name, input, status, result and the rest. */
    children: Snippet<[AparteToolCallView<I, R>]>;
  } = $props();

  // Readable only while the component initialises.
  const context = getAllContexts();
  // The matcher by its text: a `RegExp` literal in a template is a new object on every render.
  const key = $derived(typeof name === 'string' ? name : String(name));

  $effect(() => {
    void key;
    const target = config ?? aparteGlobalConfig;
    return untrack(() => target.overrideToolRenderer(
      name,
      defineMountedToolRenderer((host, view) => mountSnippet(host, () => children as Snippet<[AparteToolCallView]>, view, context)),
    ));
  });
</script>
