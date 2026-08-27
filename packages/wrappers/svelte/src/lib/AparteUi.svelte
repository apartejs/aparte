<script lang="ts">
  import { onMount, onDestroy, createEventDispatcher } from 'svelte';
  import { applyElementProps, APARTE_DEFAULT_UI_EVENTS } from '@aparte/core';

  /** The custom element tag name (e.g. 'aparte-model-selector'). */
  export let name: string;
  /** Props to apply. Keys starting with `--` become CSS variables. */
  export let props: Record<string, unknown> = {};
  /**
   * Which custom events to forward through `elementEvent`. Defaults to the
   * interactive aparté surface (APARTE_DEFAULT_UI_EVENTS); pass your own list to listen to
   * other events (e.g. ['aparte-composer-change'] for attachments).
   */
  export let events: string[] | undefined = undefined;

  const dispatch = createEventDispatcher<{ elementEvent: CustomEvent }>();

  let host: HTMLElement;
  let el: HTMLElement | null = null;
  let cleanups: Array<() => void> = [];

  function applyProps() {
    if (el) applyElementProps(el, props);
  }

  function create() {
    if (!host) return;
    el = document.createElement(name);
    applyProps();
    for (const ev of events ?? APARTE_DEFAULT_UI_EVENTS) {
      const listener = (e: Event) => dispatch('elementEvent', e as CustomEvent);
      el.addEventListener(ev, listener);
      cleanups.push(() => el?.removeEventListener(ev, listener));
    }
    host.appendChild(el);
  }

  function destroy() {
    for (const c of cleanups) c();
    cleanups = [];
    el?.remove();
    el = null;
  }

  onMount(create);
  onDestroy(destroy);

  // Recreate the element when `name` (or the forwarded event set) changes. A
  // joined key so a fresh inline `events` array doesn't thrash the element.
  let lastName = name;
  let lastEvtsKey = (events ?? APARTE_DEFAULT_UI_EVENTS).join('|');
  $: {
    const evtsKey = (events ?? APARTE_DEFAULT_UI_EVENTS).join('|');
    if (el && (name !== lastName || evtsKey !== lastEvtsKey)) {
      lastName = name;
      lastEvtsKey = evtsKey;
      destroy();
      create();
    }
  }
  $: if (el && props) applyProps();

  /*
   * Generic, to honour `AparteUiHandle` — which this package exports with a docblock
   * promising "the same contract on all four wrappers", and which React and Angular both
   * honour. These two used to return `HTMLElement | null` and `unknown`, so a consumer
   * following the documented `bind:this` pattern got a type error here and none there.
   * A cold audit compiled it and produced the real TS2322 rather than reporting a doubt.
   */
  export function getElement<T extends HTMLElement = HTMLElement>(): T | null {
    return el as T | null;
  }
  export function callMethod<T = unknown>(methodName: string, ...args: unknown[]): T | undefined {
    const fn = (el as unknown as Record<string, unknown>)?.[methodName];
    return (typeof fn === 'function' ? (fn as (...a: unknown[]) => unknown).apply(el, args) : undefined) as
      | T
      | undefined;
  }
</script>

<span bind:this={host} style="display: contents"></span>
