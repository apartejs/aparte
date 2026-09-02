<script lang="ts">
  import { onMount, onDestroy, tick, createEventDispatcher } from 'svelte';
  import { AparteChatHost, isAwaitingReply, type AparteChatHostBinding, type AparteConfig, type AparteChatImperativeApi, uuid } from '@aparte/core';
  import type { AparteMessage, AparteSegment, AparteSendEventDetail, AparteActionEventDetail } from './types';

  /**
   * The host element's `id`, and therefore the `targetId` every event this chat
   * dispatches carries. Generated when omitted — but it used to be generated and
   * neither accepted nor exposed, which made `scopeToTargetId` unreachable from
   * this component.
   */
  export let id: string | undefined = undefined;
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
  /** Overlay the composer on the transcript: full-column scroll surface, edge-to-edge scrollbar, floating composer. Read when the viewport mounts. */
  export let overlayComposer = false;
  /**
   * Add the file picker + chips strip to the default composer shell. **Off by
   * default**, because the capability needs a host that consumes the files: an
   * `AparteClient` inlines them per its `rawFileInject` option, but if you drive
   * your own loop you must read `event.files` on `messageSent` — otherwise the file
   * the user deliberately attached is dropped in silence. No effect when you fill
   * the `composer` slot (drop `<aparte-composer-add-attachment>` and
   * `<aparte-composer-attachments>` in it yourself).
   */
  export let attachments = false;
  /**
   * Render the `<aparte-elicitation>` presenter inside the host — on by default, as it
   * is in `<aparte-chat>`: the built-in approval gate and `requestUserInput()` ask
   * through it, and it renders nothing until something asks. Pass `false` when you
   * mount a presenter of your own (`setElicitationPresenter`) or place the element
   * yourself.
   */
  export let elicitation = true;
  /** Extra class names for the root element (`[data-aparte-chat]`), merged after core's own. */
  let className = '';
  export { className as class };
  /** Inline style for the root element (`[data-aparte-chat]`). */
  export let style: string | undefined = undefined;
  /** Active conversation id (loads/persists via the registered AparteConversationManager). */
  export let conversationId: string | null = null;
  /**
   * Instance {@link AparteConfig} for this chat. When set, aparté components
   * inside resolve THIS config instead of `aparteGlobalConfig`, so
   * several independently-configured chats can coexist on one page. Omit for the
   * global config. Read once when the host mounts.
   */
  export let config: AparteConfig | undefined = undefined;

  /*
   * Callback props, called with the payload itself, alongside the events below (#47).
   * Svelte 5 documents `createEventDispatcher` as deprecated and recommends callback
   * props; a Svelte 4 consumer keeps `on:` and sees nothing change, a Svelte 5 one
   * never writes `on:` on a component. Both routes fire for the same occurrence, in
   * this order: the callback, then the event.
   */
  /** User submitted a message from the composer — see `messageSent` below for the append rule. */
  export let onmessageSent: ((detail: AparteSendEventDetail) => void) | undefined = undefined;
  /** A custom bubble action (registerBubbleAction) was clicked. */
  export let onaction: ((detail: AparteActionEventDetail) => void) | undefined = undefined;
  /** Active path changed — the list to bind back to `messages`. */
  export let onmessagesChange: ((messages: AparteMessage[]) => void) | undefined = undefined;
  /** One message was appended. */
  export let onmessageAppended: ((message: AparteMessage) => void) | undefined = undefined;
  /** The typing/"thinking" indicator toggled. */
  export let ontypingChange: ((typing: boolean) => void) | undefined = undefined;
  /** The host created a conversation id (persistence). */
  export let onconversationCreated: ((id: string) => void) | undefined = undefined;

  const dispatch = createEventDispatcher<{
    /**
     * User submitted a message from the composer. It is **appended to the
     * thread automatically** (optimistic UI) before this fires — do NOT add it
     * again (uncontrolled → duplicates; controlled → mirror into your own
     * `messages`). For side-effects: scroll, analytics, send.
     */
    messageSent: AparteSendEventDetail;
    /** A custom bubble action (registerBubbleAction) was clicked — typed aparte-action. */
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
    const detail = (event as CustomEvent<AparteSendEventDetail>).detail;
    onmessageSent?.(detail);
    dispatch('messageSent', detail);
  }

  // Custom bubble actions bubble to the root as `aparte-action` — dispatch typed.
  function handleAction(event: Event) {
    const detail = (event as CustomEvent<AparteActionEventDetail>).detail;
    onaction?.(detail);
    dispatch('action', detail);
  }

  onMount(() => {
    // A caller-supplied `id` wins, so `scopeToTargetId` has something to match.
    hostId = id ?? `aparte-chat-${uuid()}`;
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
      onMessagesChange: (m) => { onmessagesChange?.(m as AparteMessage[]); dispatch('messagesChange', m as AparteMessage[]); },
      onMessageAppended: (m) => { onmessageAppended?.(m as AparteMessage); dispatch('messageAppended', m as AparteMessage); },
      onTypingChange: (t) => { typingActive = t; ontypingChange?.(t); dispatch('typingChange', t); },
      onStreamingChange: () => { /* exposed via isStreaming() */ },
      afterRender: (cb) => { void tick().then(cb); },
      resetComposer: () => (composerRef as unknown as { reset?: () => void })?.reset?.(),
    };
    host = new AparteChatHost(binding, {
      layoutTransitionMs,
      conversationId: conversationId ?? null,
      onConversationCreated: (id) => { onconversationCreated?.(id); dispatch('conversationCreated', id); },
      config,
    });
    teardown = host.bind();
    host.syncBubbles();
    rootRef?.addEventListener('aparte-action', handleAction);
  });

  onDestroy(() => {
    rootRef?.removeEventListener('aparte-action', handleAction);
    teardown?.();
    teardown = null;
    host = null;
  });

  // ── Imperative API (bind:this on the component) ──
  export function appendMessage(m: AparteMessage, options?: { historical?: boolean }) { host?.appendMessage(m, options); }
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
  /**
   * The `<aparte-chat-viewport>` element — for custom scroll handling, an
   * IntersectionObserver, etc. Same `getViewport()` accessor on all four
   * wrappers.
   */
  export function getViewport(): HTMLElement | null { return viewportRef ?? null; }
  export function focusInput() {
    (composerRef as unknown as { focus?: () => void })?.focus?.();
  }
  export function isStreaming(): boolean { return host?.isStreaming ?? false; }

  // Compile-time parity check: Svelte 4 can't generic-annotate `export function`s,
  // so this never-called factory type-checks that the exported surface matches the
  // canonical AparteChatImperativeApi. A dropped/mistyped method is a build error.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  function _assertImperativeParity(): AparteChatImperativeApi {
    return {
      appendMessage, updateMessage, updateLastMessage, addSegment, updateSegment, removeSegment,
      appendToSegment, getMessages, clearMessages, addBranch, addSiblingOf, truncateFrom,
      truncateResponsesAfter, injectTokenStream, stopTokenStream, setConversationId,
      scrollToBottom, focusInput, isStreaming, getViewport,
    };
  }
</script>

<div
  class="aparte-chat-container {className}"
  class:aparte-chat-container--auto-center={centerWhenEmpty}
  {style}
  data-aparte-chat
  {...(overlayComposer ? { 'overlay-composer': '' } : {})}
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
          data-kind={m.compaction ? 'compaction' : undefined}
          timestamp={m.timestamp}
          content={m.content}
          streaming={isAwaitingReply(m) ? '' : null}></aparte-chat-bubble>
      </slot>
    {/each}
    <aparte-chat-status visible={typingActive ? '' : null} text={typingText}></aparte-chat-status>
  </aparte-chat-viewport>

  <!-- The presenter for a request to the human (approval gate, ask_user…). Renders
       nothing until something asks; on by default as in <aparte-chat>. -->
  {#if elicitation}<aparte-elicitation></aparte-elicitation>{/if}

  <!-- Content above the composer (banner, disclaimer, context chip). -->
  <slot name="above-composer" />

  <aparte-composer
    bind:this={composerRef}
    on:aparte-send={handleSend}
  >
    <!-- Custom composer via the `composer` slot; falls back to the default
         shell (input · send, plus the attachment primitives when `attachments` is
         set). Compose the headless aparte-composer-* primitives freely for a
         skin-specific layout. -->
    <slot name="composer">
      <div class="aparte-composer-shell">
        {#if attachments}<aparte-composer-attachments></aparte-composer-attachments>{/if}
        <div class="aparte-composer-row">
          {#if attachments}<aparte-composer-add-attachment></aparte-composer-add-attachment>{/if}
          <aparte-composer-input></aparte-composer-input>
          <aparte-composer-send></aparte-composer-send>
        </div>
        <!-- The composer's bottom row. ONE slot: placement is the DOM order, and
             `margin-inline-start: auto` pushes a control to the end (a logical
             property, so it reads correctly in RTL). Nothing is rendered at all when
             the slot is unused. -->
        {#if $$slots.toolbar}
          <aparte-composer-toolbar>
            <slot name="toolbar" />
          </aparte-composer-toolbar>
        {/if}
      </div>
    </slot>
  </aparte-composer>
</div>
