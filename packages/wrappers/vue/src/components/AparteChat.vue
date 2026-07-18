<script setup lang="ts">
import { ref, watch, onMounted, onBeforeUnmount, nextTick, useId, toRaw } from 'vue';
import { AparteChatHost, type AparteChatHostBinding, type AparteConfigClass } from '@aparte/core';
import type { AparteMessage, AparteSegment, AparteSendEventDetail, AparteActionEventDetail } from '../types.js';

interface Props {
  /** Optional: omit for an uncontrolled chat (defaults to []); use `v-model:messages` to control. */
  messages?: AparteMessage[];
  placeholder?: string;
  disabled?: boolean;
  isTyping?: boolean;
  typingText?: string;
  /** When false, Shift+Enter submits and a bare Enter inserts a newline. */
  submitOnEnter?: boolean;
  /** Freeze viewport spacer recalculation for this many ms after a conv swap. */
  layoutTransitionMs?: number;
  /**
   * Opt in to the "centered composer when empty" layout: the composer sits
   * vertically centered with the `empty-state` slot above it while the list is
   * empty, then slides to the bottom on the first message (~0.3s). Off by
   * default — additive (adds the `--auto-center` modifier + a `data-aparte-empty`
   * attribute the shipped `aparte.css` recipe keys off).
   */
  centerWhenEmpty?: boolean;
  /** Active conversation id (loads/persists via the registered ConversationManager). */
  conversationId?: string | null;
  /**
   * Instance {@link AparteConfigClass} for this chat. When set, aparté components
   * inside resolve THIS config instead of the global `AparteConfig` singleton, so
   * several independently-configured chats can coexist on one page. Omit for the
   * global config. Read once when the host mounts.
   */
  config?: AparteConfigClass;
}

const props = withDefaults(defineProps<Props>(), {
  messages: () => [],
  placeholder: 'Type a message...',
  disabled: false,
  isTyping: false,
  typingText: 'Assistant is thinking...',
  submitOnEnter: true,
  layoutTransitionMs: 0,
  centerWhenEmpty: false,
  conversationId: null,
});

const emit = defineEmits<{
  /**
   * User submitted a message from the composer. The message is **appended to
   * the thread automatically** (optimistic UI) before this fires — do NOT add
   * it again in the handler (uncontrolled → duplicates; controlled → mirror it
   * into your own `messages`). For side-effects: scroll, analytics, send.
   */
  messageSent: [event: AparteSendEventDetail];
  /** A custom bubble action (registerBubbleAction) was clicked — typed aparte-action. */
  action: [detail: AparteActionEventDetail];
  /** Active path changed (branch nav/edit/retry/streaming) — bind back to `messages`. */
  messagesChange: [messages: AparteMessage[]];
  /** Same payload as `messagesChange`, enabling `v-model:messages`. */
  'update:messages': [messages: AparteMessage[]];
  messageAppended: [message: AparteMessage];
  /** The typing/"thinking" indicator toggled (the host flips it off on the first streamed token). */
  typingChange: [isTyping: boolean];
  conversationCreated: [id: string];
}>();

// useId() (Vue 3.5+) is SSR-stable — server and client agree, no hydration mismatch.
const hostId = `aparte-chat-${useId()}`;
const rootRef = ref<HTMLElement>();
const viewportRef = ref<HTMLElement>();
const composerRef = ref<HTMLElement>();
const internalMessages = ref<AparteMessage[]>([...props.messages]);
const typingActive = ref(props.isTyping);

let host: AparteChatHost | null = null;
let teardown: (() => void) | null = null;

function onSend(e: Event) {
  (viewportRef.value as unknown as { requestSmoothScroll?: () => void })?.requestSmoothScroll?.();
  emit('messageSent', (e as CustomEvent<AparteSendEventDetail>).detail);
}

// Custom bubble actions bubble to the root as `aparte-action` — surface them typed.
function onAction(e: Event) {
  emit('action', (e as CustomEvent<AparteActionEventDetail>).detail);
}

onMounted(() => {
  const binding: AparteChatHostBinding = {
    hostId,
    host: rootRef.value as HTMLElement,
    viewport: viewportRef.value ?? null,
    getMessages: () => internalMessages.value,
    setMessages: (m) => { internalMessages.value = m as AparteMessage[]; },
    onMessagesChange: (m) => { emit('messagesChange', m as AparteMessage[]); emit('update:messages', m as AparteMessage[]); },
    onMessageAppended: (m) => emit('messageAppended', m as AparteMessage),
    onTypingChange: (t) => { typingActive.value = t; emit('typingChange', t); },
    onStreamingChange: () => { /* exposed via isStreaming() */ },
    afterRender: (cb) => { void nextTick(cb); },
    resetComposer: () => (composerRef.value as unknown as { reset?: () => void })?.reset?.(),
  };
  host = new AparteChatHost(binding, {
    layoutTransitionMs: props.layoutTransitionMs,
    conversationId: props.conversationId ?? null,
    onConversationCreated: (id) => emit('conversationCreated', id),
    // Unwrap Vue's reactive proxy: the config is a plain class with internal
    // Map registries the host/components must operate on directly, not through a
    // deep reactive proxy (which would wrap those Maps and break lookups).
    config: props.config ? toRaw(props.config) : undefined,
  });
  teardown = host.bind();
  host.syncBubbles();
  composerRef.value?.addEventListener('aparte-send', onSend);
  rootRef.value?.addEventListener('aparte-action', onAction);
});

onBeforeUnmount(() => {
  composerRef.value?.removeEventListener('aparte-send', onSend);
  rootRef.value?.removeEventListener('aparte-action', onAction);
  teardown?.();
  teardown = null;
  host = null;
});

// Parent push → internal list (guarded against the host's own emit round-trip).
watch(() => props.messages, (m) => {
  if (m === internalMessages.value) return;
  internalMessages.value = [...m];
  if (m.length === 0) host?.clearRenderCache();
});

// Reconcile bubbles after the rendered list changes (host queries the DOM).
watch(internalMessages, () => { void nextTick(() => host?.syncBubbles()); });

watch(() => props.isTyping, (t) => { typingActive.value = t; });
watch(() => props.conversationId, (id) => { void host?.setConversationId(id ?? null); });

// ── Imperative API (forwards to the host) ──
const appendMessage = (m: AparteMessage) => host?.appendMessage(m);
const updateMessage = (id: string, u: Partial<AparteMessage>) => host?.updateMessage(id, u);
const updateLastMessage = (c: string, o?: { append?: boolean }) => host?.updateLastMessage(c, o);
const addSegment = (s: AparteSegment) => host?.addSegment(s);
const updateSegment = (id: string, u: Partial<AparteSegment>) => host?.updateSegment(id, u);
const removeSegment = (id: string) => host?.removeSegment(id);
const appendToSegment = (id: string, c: string) => host?.appendToSegment(id, c);
const getMessages = () => host?.getMessages() ?? internalMessages.value;
const clearMessages = () => host?.clearMessages();
const addBranch = (id: string) => host?.addBranch(id) ?? 0;
const addSiblingOf = (id: string, m: AparteMessage) => host?.addSiblingOf(id, m) ?? null;
const truncateFrom = (id: string) => host?.truncateFrom(id);
const truncateResponsesAfter = (id: string) => host?.truncateResponsesAfter(id);
const injectTokenStream = (id: string, tokens: AsyncIterable<string>) =>
  host?.streamTokens(id, tokens) ?? Promise.resolve();
const stopTokenStream = () => host?.stopTokenStream();
const setConversationId = (id: string | null) => host?.setConversationId(id) ?? Promise.resolve();
const scrollToBottom = () => (viewportRef.value as unknown as { scrollToBottom?: () => void })?.scrollToBottom?.();
const focusInput = () => (composerRef.value as unknown as { focus?: () => void })?.focus?.();
const isStreaming = () => host?.isStreaming ?? false;

// `getViewport()` (not a raw `viewport` ref): the same accessor on all four
// wrappers — Svelte 4 can only expose functions, so the shared name is one.
const getViewport = () => viewportRef.value ?? null;

defineExpose({
  appendMessage, updateMessage, updateLastMessage, addSegment, updateSegment, removeSegment,
  appendToSegment, getMessages, clearMessages, addBranch, addSiblingOf, truncateFrom,
  truncateResponsesAfter, injectTokenStream, stopTokenStream, setConversationId,
  scrollToBottom, focusInput, isStreaming, getViewport,
});
</script>

<template>
  <div
    :class="['aparte-chat-container', { 'aparte-chat-container--auto-center': centerWhenEmpty }]"
    data-aparte-chat
    :data-aparte-empty="centerWhenEmpty && internalMessages.length === 0 ? '' : null"
    :id="hostId"
    ref="rootRef"
  >
    <aparte-chat-viewport ref="viewportRef" framework-managed="">
      <!-- Welcome / placeholder shown inside the viewport while there are no
           messages (a real empty-state region). -->
      <slot v-if="internalMessages.length === 0" name="empty-state" />
      <!-- `bubble` scoped slot renders your OWN element per message in place of
           <aparte-chat-bubble>; driven by the reactive list so it streams live. -->
      <template v-for="m in internalMessages" :key="m.id">
        <slot name="bubble" :message="m">
          <aparte-chat-bubble
            :message-id="m.id"
            :data-role="m.role"
            :timestamp="m.timestamp"
            :content="m.content"
            :streaming="(m.status === 'streaming' || m.status === 'pending') ? '' : null"
          />
        </slot>
      </template>
      <aparte-chat-status :visible="typingActive ? '' : null" :text="typingText" />
    </aparte-chat-viewport>

    <!-- Content above the composer (banner, disclaimer, context chip). -->
    <slot name="above-composer" />

    <!-- `.attr` forces attribute-setting: core's <aparte-composer> exposes
         `placeholder`/`disabled` as getter-only accessors, so Vue's default
         property-set (it prefers props on custom elements) would throw and the
         value would silently never apply. -->
    <aparte-composer
      ref="composerRef"
      :target="hostId"
      :placeholder.attr="placeholder"
      :disabled.attr="disabled ? '' : null"
      :submit-on-enter="submitOnEnter ? null : 'false'"
    >
      <!-- Custom composer via the `composer` slot; falls back to the default
           shell (add-attachment · input · send). Compose the headless
           aparte-composer-* primitives freely for a skin-specific layout. -->
      <slot name="composer">
        <div class="aparte-composer-shell">
          <aparte-composer-attachments></aparte-composer-attachments>
          <div class="aparte-composer-row">
            <aparte-composer-add-attachment></aparte-composer-add-attachment>
            <aparte-composer-input></aparte-composer-input>
            <aparte-composer-send></aparte-composer-send>
          </div>
          <!-- Footer slots (model selector, token counter…). The row is
               removed from view by .aparte-composer-footer:empty when unused. -->
          <div
            v-if="$slots['footer-left'] || $slots['footer-center'] || $slots['footer-right']"
            class="aparte-composer-footer"
          >
            <slot name="footer-left" />
            <slot name="footer-center" />
            <slot name="footer-right" />
          </div>
        </div>
      </slot>
    </aparte-composer>
  </div>
</template>
