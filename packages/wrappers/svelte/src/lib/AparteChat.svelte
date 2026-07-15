<script lang="ts">
  import { onMount, onDestroy, tick, createEventDispatcher } from 'svelte';
  import { AparteChatHost, type AparteChatHostBinding, type AparteConfigClass } from '@aparte/core';
  import type { AparteMessage, AparteSegment, AparteSendEventDetail, AparteActionEventDetail } from './types';

  export let messages: AparteMessage[] = [];
  export let placeholder = 'Type a message...';
  export let disabled = false;
  export let isTyping = false;
  export let typingText = 'Assistant is thinking...';
  /** When false, Shift+Enter submits and a bare Enter inserts a newline. */
  export let submitOnEnter = true;
  /** Freeze viewport spacer recalculation for this many ms after a conv swap. */
  export let layoutTransitionMs = 0;
  /**
   * Opt in to the "centered composer when empty" layout: the composer sits
   * vertically centered with the `empty-state` slot above it while the list is
   * empty, then slides to the bottom on the first message (~0.3s). Off by
   * default — additive.
   */
  export let centerWhenEmpty = false;
  /** Active conversation id (loads/persists via the registered ConversationManager). */
  export let conversationId: string | null = null;
  /**
   * Instance {@link AparteConfigClass} for this chat. When set, aparté components
   * inside resolve THIS config instead of the global `AparteConfig` singleton, so
   * several independently-configured chats can coexist on one page. Omit for the
   * global config. Read once when the host mounts.
   */
  export let config: AparteConfigClass | undefined = undefined;

  const dispatch = createEventDispatcher<{
    /**
     * User submitted a message from the composer. It is **appended to the
     * thread automatically** (optimistic UI) before this fires — do NOT add it
     * again (uncontrolled → duplicates; controlled → mirror into your own
     * `messages`). For side-effects: scroll, analytics, send.
     */
    messageSent: AparteSendEventDetail;
    /** A custom bubble action (registerBubbleAction) was clicked — typed aparte:action. */
    action: AparteActionEventDetail;
    /** Active path changed (branch nav/edit/retry/streaming) — bind back to `messages`. */
    messagesChange: AparteMessage[];
    messageAppended: AparteMessage;
    /** The typing/"thinking" indicator toggled (the host flips it off on the first streamed token). */
    typingChange: boolean;
    conversationCreated: string;
  }>();

  // Generated client-side in onMount (below): during SSR this stays empty so the
  // server and first client render agree on the id — no hydration mismatch.
  let hostId = '';

  let rootRef: HTMLElement;
  let viewportRef: HTMLElement;
  let composerRef: HTMLElement;
  let internalMessages: AparteMessage[] = [...messages];
  let typingActive = isTyping;
  let host: AparteChatHost | null = null;
  let teardown: (() => void) | null = null;

  // Parent push → internal list (guarded against the host's own emit round-trip).
  let lastProp = messages;
  $: if (messages !== lastProp) {
    lastProp = messages;
    internalMessages = [...messages];
    if (messages.length === 0) host?.clearRenderCache();
  }

  // Controlled typing indicator (host may flip it off on the first token).
  let lastTyping = isTyping;
  $: if (isTyping !== lastTyping) { lastTyping = isTyping; typingActive = isTyping; }

  // Conversation id changes (initial value loaded by the host on bind).
  let lastConv = conversationId;
  $: if (conversationId !== lastConv) {
    lastConv = conversationId;
    void host?.setConversationId(conversationId ?? null);
  }

  // Reconcile bubbles after the rendered list changes (host queries the DOM).
  $: if (host && internalMessages) { void tick().then(() => host?.syncBubbles()); }

  // Composer attributes set imperatively (like Angular's `[attr.x]`): Svelte's
  // custom-element binding assigns to *properties*, but aparte-composer exposes
  // some of these (e.g. `placeholder`) as getter-only — assigning throws.
  function toggleAttr(el: HTMLElement, name: string, on: boolean, value: string) {
    if (on) el.setAttribute(name, value); else el.removeAttribute(name);
  }
  $: if (composerRef) {
    composerRef.setAttribute('target', hostId);
    composerRef.setAttribute('placeholder', placeholder);
    toggleAttr(composerRef, 'disabled', disabled, '');
    toggleAttr(composerRef, 'submit-on-enter', !submitOnEnter, 'false');
  }

  function handleSend(event: Event) {
    (viewportRef as unknown as { requestSmoothScroll?: () => void })?.requestSmoothScroll?.();
    dispatch('messageSent', (event as CustomEvent<AparteSendEventDetail>).detail);
  }

  // Custom bubble actions bubble to the root as `aparte:action` — dispatch typed.
  function handleAction(event: Event) {
    dispatch('action', (event as CustomEvent<AparteActionEventDetail>).detail);
  }

  onMount(() => {
    hostId = `aparte-chat-${crypto.randomUUID()}`;
    // Set the id imperatively (deterministic, like Angular's ngAfterViewInit) rather
    // than waiting on a reactive re-render of `id={hostId}`; the composer target
    // reactive block below picks up the same hostId.
    if (rootRef) rootRef.id = hostId;
    const binding: AparteChatHostBinding = {
      hostId,
      host: rootRef,
      viewport: viewportRef,
      getMessages: () => internalMessages,
      setMessages: (m) => { internalMessages = m as AparteMessage[]; },
      onMessagesChange: (m) => dispatch('messagesChange', m as AparteMessage[]),
      onMessageAppended: (m) => dispatch('messageAppended', m as AparteMessage),
      onTypingChange: (t) => { typingActive = t; dispatch('typingChange', t); },
      onStreamingChange: () => { /* exposed via isStreaming() */ },
      afterRender: (cb) => { void tick().then(cb); },
      resetComposer: () => (composerRef as unknown as { reset?: () => void })?.reset?.(),
    };
    host = new AparteChatHost(binding, {
      layoutTransitionMs,
      conversationId: conversationId ?? null,
      onConversationCreated: (id) => dispatch('conversationCreated', id),
      config,
    });
    teardown = host.bind();
    host.syncBubbles();
    rootRef?.addEventListener('aparte:action', handleAction);
  });

  onDestroy(() => {
    rootRef?.removeEventListener('aparte:action', handleAction);
    teardown?.();
    teardown = null;
    host = null;
  });

  // ── Imperative API (bind:this on the component) ──
  export function appendMessage(m: AparteMessage) { host?.appendMessage(m); }
  export function updateMessage(id: string, u: Partial<AparteMessage>) { host?.updateMessage(id, u); }
  export function updateLastMessage(content: string, options?: { append?: boolean }) {
    host?.updateLastMessage(content, options);
  }
  export function addSegment(segment: AparteSegment) { host?.addSegment(segment); }
  export function updateSegment(segmentId: string, updates: Partial<AparteSegment>) {
    host?.updateSegment(segmentId, updates);
  }
  export function removeSegment(segmentId: string) { host?.removeSegment(segmentId); }
  export function appendToSegment(segmentId: string, content: string) {
    host?.appendToSegment(segmentId, content);
  }
  export function getMessages(): AparteMessage[] { return host?.getMessages() ?? internalMessages; }
  export function clearMessages() { host?.clearMessages(); }
  export function addBranch(messageId: string): number { return host?.addBranch(messageId) ?? 0; }
  export function addSiblingOf(existingId: string, message: AparteMessage): string | null {
    return host?.addSiblingOf(existingId, message) ?? null;
  }
  export function truncateFrom(messageId: string) { host?.truncateFrom(messageId); }
  export function truncateResponsesAfter(userMessageId: string) {
    host?.truncateResponsesAfter(userMessageId);
  }
  export function injectTokenStream(messageId: string, tokens: AsyncIterable<string>): Promise<void> {
    return host?.streamTokens(messageId, tokens) ?? Promise.resolve();
  }
  export function stopTokenStream() { host?.stopTokenStream(); }
  export function setConversationId(id: string | null): Promise<void> {
    return host?.setConversationId(id) ?? Promise.resolve();
  }
  export function scrollToBottom() {
    (viewportRef as unknown as { scrollToBottom?: () => void })?.scrollToBottom?.();
  }
  export function focusInput() {
    (composerRef as unknown as { focus?: () => void })?.focus?.();
  }
  export function isStreaming(): boolean { return host?.isStreaming ?? false; }
</script>

<div
  class="aparte-chat-container"
  class:aparte-chat-container--auto-center={centerWhenEmpty}
  data-aparte-chat
  data-aparte-empty={centerWhenEmpty && internalMessages.length === 0 ? '' : null}
  id={hostId}
  bind:this={rootRef}
>
  <aparte-chat-viewport bind:this={viewportRef} framework-managed="">
    <!-- Welcome / placeholder shown inside the viewport while empty. -->
    {#if internalMessages.length === 0}
      <slot name="empty-state" />
    {/if}
    <!-- `bubble` slot renders your OWN element per message in place of
         <aparte-chat-bubble>; driven by the reactive list so it streams live. -->
    {#each internalMessages as m (m.id)}
      <slot name="bubble" message={m}>
        <aparte-chat-bubble
          message-id={m.id}
          data-role={m.role}
          timestamp={m.timestamp}
          content={m.content}
          streaming={(m.status === 'streaming' || m.status === 'pending') ? '' : null}
        />
      </slot>
    {/each}
    <aparte-chat-status visible={typingActive ? '' : null} text={typingText} />
  </aparte-chat-viewport>

  <!-- Content above the composer (banner, disclaimer, context chip). -->
  <slot name="above-composer" />

  <aparte-composer
    bind:this={composerRef}
    on:aparte-send={handleSend}
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
        {#if $$slots['footer-left'] || $$slots['footer-center'] || $$slots['footer-right']}
          <div class="aparte-composer-footer">
            <slot name="footer-left" />
            <slot name="footer-center" />
            <slot name="footer-right" />
          </div>
        {/if}
      </div>
    </slot>
  </aparte-composer>
</div>
