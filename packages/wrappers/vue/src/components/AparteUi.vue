<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue';

const p = defineProps<{
  /** The custom element tag name (e.g. 'aparte-chat-input'). */
  name: string;
  /** Props to apply. Keys starting with `--` become CSS variables. */
  props?: Record<string, unknown>;
  /**
   * Which custom events to forward through `elementEvent`. Defaults to the
   * interactive aparté surface (DEFAULT_EVENTS); pass your own list to listen to
   * other events (e.g. ['aparte:composer-change'] for attachments).
   */
  events?: string[];
}>();

const emit = defineEmits<{ elementEvent: [event: CustomEvent] }>();

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

// A stable key so a fresh inline `:events` array doesn't thrash the element —
// only a real change to the event names rebinds (mirrors React's evtsKey).
const evtsKey = computed(() => (p.events ?? DEFAULT_EVENTS).join('|'));

const hostRef = ref<HTMLElement>();
let el: HTMLElement | null = null;
let cleanups: Array<() => void> = [];

function applyProps() {
  if (!el) return;
  for (const [key, value] of Object.entries(p.props ?? {})) {
    if (key.startsWith('--')) el.style.setProperty(key, String(value));
    else if (!(key.startsWith('on') && typeof value === 'function')) {
      (el as unknown as Record<string, unknown>)[key] = value;
    }
  }
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

defineExpose({
  getElement: () => el,
  callMethod: (methodName: string, ...args: unknown[]) => {
    const fn = (el as unknown as Record<string, unknown>)?.[methodName];
    return typeof fn === 'function' ? (fn as (...a: unknown[]) => unknown).apply(el, args) : undefined;
  },
});
</script>

<template>
  <span ref="hostRef" style="display: contents"></span>
</template>
