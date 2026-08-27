<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount, toRaw } from 'vue';
import { applyElementProps, APARTE_DEFAULT_UI_EVENTS } from '@aparte/core';
import type { AparteUiHandle } from '../types.js';

const p = defineProps<{
  /** The custom element tag name (e.g. 'aparte-model-selector'). */
  name: string;
  /** Props to apply. Keys starting with `--` become CSS variables. */
  props?: Record<string, unknown>;
  /**
   * Which custom events to forward through `elementEvent`. Defaults to the
   * interactive aparté surface (APARTE_DEFAULT_UI_EVENTS); pass your own list to listen to
   * other events (e.g. ['aparte-composer-change'] for attachments).
   */
  events?: string[];
}>();

const emit = defineEmits<{ elementEvent: [event: CustomEvent] }>();

// A stable key so a fresh inline `:events` array doesn't thrash the element —
// only a real change to the event names rebinds (mirrors React's evtsKey).
const evtsKey = computed(() => (p.events ?? APARTE_DEFAULT_UI_EVENTS).join('|'));

const hostRef = ref<HTMLElement>();
let el: HTMLElement | null = null;
let cleanups: Array<() => void> = [];

// Vue passes `toRaw` so objects are unwrapped from the reactive proxy before
// reaching the plain custom element (a deep proxy breaks Maps/class internals).
function applyProps() {
  if (el) applyElementProps(el, p.props ?? {}, toRaw);
}

function create() {
  if (!hostRef.value) return;
  el = document.createElement(p.name);
  applyProps();
  for (const ev of evtsKey.value.split('|').filter(Boolean)) {
    const listener = (e: Event) => emit('elementEvent', e as CustomEvent);
    el.addEventListener(ev, listener);
    cleanups.push(() => el?.removeEventListener(ev, listener));
  }
  hostRef.value.appendChild(el);
}

function destroy() {
  for (const c of cleanups) c();
  cleanups = [];
  el?.remove();
  el = null;
}

onMounted(create);
onBeforeUnmount(destroy);
watch(() => p.name, () => { destroy(); create(); });
watch(evtsKey, () => { destroy(); create(); });
watch(() => p.props, applyProps, { deep: true });

/*
 * Typed as `AparteUiHandle`, the way React's `useImperativeHandle` already is.
 *
 * It used to be a bare object literal, so the exposed `getElement` returned
 * `HTMLElement | null` instead of the interface's `<T extends HTMLElement>() => T | null`
 * — and the barrel exports that interface with a docblock promising "the same contract on
 * all four wrappers". A consumer following the documented `ref` pattern got a type error
 * on Vue and Svelte and none on React or Angular. Found by a cold audit that compiled it
 * rather than read it.
 *
 * `as never` is the same bridge React uses at AparteUi.tsx:85: the value really is the
 * element, and only the caller knows which subtype it asked for.
 */
defineExpose<AparteUiHandle>({
  getElement: () => el as never,
  callMethod: (methodName: string, ...args: unknown[]) => {
    const fn = (el as unknown as Record<string, unknown>)?.[methodName];
    return (typeof fn === 'function' ? (fn as (...a: unknown[]) => unknown).apply(el, args) : undefined) as never;
  },
});
</script>

<template>
  <span ref="hostRef" style="display: contents"></span>
</template>
