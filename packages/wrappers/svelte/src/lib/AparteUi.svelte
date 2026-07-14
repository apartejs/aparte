<script lang="ts">
  import { onMount, onDestroy, createEventDispatcher } from 'svelte';

  /** The custom element tag name (e.g. 'aparte-chat-input'). */
  export let name: string;
  /** Props to apply. Keys starting with `--` become CSS variables. */
  export let props: Record<string, unknown> = {};
  /**
   * Which custom events to forward through `elementEvent`. Defaults to the
   * interactive aparté surface (DEFAULT_EVENTS); pass your own list to listen to
   * other events (e.g. ['aparte:composer-change'] for attachments).
   */
  export let events: string[] | undefined = undefined;

  const dispatch = createEventDispatcher<{ elementEvent: CustomEvent }>();

  /** The custom events aparté elements actually dispatch (verified against core). */
  const DEFAULT_EVENTS = [
    'aparte-send',
    'aparte:action',
    'aparte:retry',
    'aparte:edit',
    'aparte:branch-navigate',
    'aparte:composer-change',
    'aparte:path-changed',
  ];

  let host: HTMLElement;
  let el: HTMLElement | null = null;
  let cleanups: Array<() => void> = [];

  function applyProps() {
    if (!el) return;
    for (const [key, value] of Object.entries(props)) {
      if (key.startsWith('--')) el.style.setProperty(key, String(value));
      else if (!(key.startsWith('on') && typeof value === 'function')) {
        (el as unknown as Record<string, unknown>)[key] = value;
      }
    }
  }

  function create() {
    if (!host) return;
    el = document.createElement(name);
    applyProps();
    for (const ev of events ?? DEFAULT_EVENTS) {
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
  let lastEvtsKey = (events ?? DEFAULT_EVENTS).join('|');
  $: {
    const evtsKey = (events ?? DEFAULT_EVENTS).join('|');
    if (el && (name !== lastName || evtsKey !== lastEvtsKey)) {
      lastName = name;
      lastEvtsKey = evtsKey;
      destroy();
      create();
    }
  }
  $: if (el && props) applyProps();

  export function getElement() { return el; }
  export function callMethod(methodName: string, ...args: unknown[]) {
    const fn = (el as unknown as Record<string, unknown>)?.[methodName];
    return typeof fn === 'function' ? (fn as (...a: unknown[]) => unknown).apply(el, args) : undefined;
  }
</script>

<span bind:this={host} style="display: contents"></span>
