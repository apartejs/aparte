<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { applyElementProps, APARTE_DEFAULT_UI_EVENTS } from '@aparte/core';

  /**
   * Mounts any element by tag name, sets its props and forwards its events — for an element
   * aparté does not wrap (a plugin's, or one of yours). Svelte 5: props and a callback prop.
   */
  let {
    name,
    props = {},
    events,
    onelementEvent,
  }: {
    /** The custom element tag name (e.g. 'aparte-model-selector'). */
    name: string;
    /** Props to apply. Keys starting with `--` become CSS variables. */
    props?: Record<string, unknown>;
    /** Which custom events to forward. Defaults to `APARTE_DEFAULT_UI_EVENTS`. */
    events?: string[];
    /** Called with the element's own CustomEvent for every forwarded event. */
    onelementEvent?: (event: CustomEvent) => void;
  } = $props();

  let hostEl: HTMLElement | undefined = $state();
  let el = $state.raw<HTMLElement | null>(null);

  // The element is created anew when the tag or the forwarded event set changes; a fresh
  // inline `events` array with the same names does not recreate it.
  const eventsKey = $derived((events ?? APARTE_DEFAULT_UI_EVENTS).join('|'));

  let mounted = $state(false);
  onMount(() => { mounted = true; });

  $effect(() => {
    if (!mounted || !hostEl) return;
    const tag = name;
    const names = eventsKey.split('|');
    const created = document.createElement(tag);
    const listener = (e: Event) => onelementEvent?.(e as CustomEvent);
    for (const ev of names) created.addEventListener(ev, listener);
    untrack(() => applyElementProps(created, props));
    hostEl.appendChild(created);
    el = created;
    return () => {
      for (const ev of names) created.removeEventListener(ev, listener);
      created.remove();
      if (el === created) el = null;
    };
  });

  $effect(() => {
    const current = el;
    const next = props;
    if (current) applyElementProps(current, next);
  });

  /** The mounted element — the same contract as `AparteUiHandle` on all four wrappers. */
  export function getElement<T extends HTMLElement = HTMLElement>(): T | null {
    return el as T | null;
  }
  export function callMethod<T = unknown>(methodName: string, ...args: unknown[]): T | undefined {
    const fn = (el as unknown as Record<string, unknown>)?.[methodName];
    return (typeof fn === 'function' ? (fn as (...a: unknown[]) => unknown).apply(el, args) : undefined) as T | undefined;
  }
</script>

<span bind:this={hostEl} style="display: contents"></span>
