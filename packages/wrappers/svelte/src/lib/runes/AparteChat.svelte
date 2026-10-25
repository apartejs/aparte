<script lang="ts">
  import { onMount, tick, untrack } from 'svelte';
  import { AparteChatHost, aparteGlobalConfig, isAwaitingReply, releaseDeferredHydration, type AparteChatHostBinding, type AparteChatImperativeApi } from '@aparte/core';
  import type { AparteMessage, AparteSegment, AparteSendEventDetail, AparteActionEventDetail } from '../types.js';
  import type { AparteChatProps } from './types.js';

  /*
   * The Svelte 5 chat: the same host, the same markup and the same rules as the
   * Svelte-4-syntax component, written the way a Svelte 5 app writes components —
   * `$props`, a bindable `messages`, snippets for the five places for your own markup,
   * callback props for every event. The orchestration (streaming, branches, the
   * conversation controller) is core's `AparteChatHost`, bound once on mount.
   */
  let {
    id,
    messages = $bindable([]),
    placeholder = 'Type a message...',
    disabled = false,
    isTyping = false,
    typingText,
    submitOnEnter = true,
    layoutTransitionMs = 0,
    centerWhenEmpty = false,
    loading = false,
    overlayComposer = false,
    attachments = false,
    elicitation = true,
    class: className = '',
    style,
    conversationId = null,
    config,
    emptyState,
    aboveComposer,
    composer,
    toolbar,
    bubble,
    onmessageSent,
    onaction,
    onmessagesChange,
    onmessageAppended,
    ontypingChange,
    onconversationCreated,
  }: AparteChatProps = $props();

  // A caller-supplied id wins, so `scopeToTargetId` has something to match; otherwise one
  // that the server render and the browser agree on.
  const uid = $props.id();
  const hostId = untrack(() => id) ?? `aparte-chat-${uid}`;

  let rootRef: HTMLElement | undefined = $state();
  // The server render carries `defer-hydration` on the root, so core's elements leave the
  // server's DOM alone until Svelte has it; onMount releases them. The client never draws it:
  // a client-only render holds nothing, so a slot's component — whose onMount runs before the
  // chat's — talks to live elements. A hydration may take the server's attribute off as it
  // claims the root; the release does not wait for that either.
  const serverRender = typeof window === 'undefined';
  let viewportRef: HTMLElement | undefined = $state();
  let composerRef: HTMLElement | undefined = $state();
  let host: AparteChatHost | null = null;

  // The list the transcript draws. Raw, not deep state: the host replaces it whole, and a
  // proxy around the messages would be handed to core on every read.
  let internalMessages = $state.raw<AparteMessage[]>(untrack(() => [...messages]));
  let typingActive = $state(untrack(() => isTyping));
  // The controller's wait (a conversation fetched through the adapter), or the caller's.
  let hostLoading = $state(false);
  const waiting = $derived(loading || hostLoading);

  // Bumped on every config change: the two labels below are locale text.
  let localeTick = $state(0);
  const loadingText = $derived.by(() => { void localeTick; return (config ?? aparteGlobalConfig).t('loadingConversation'); });
  const typingLabel = $derived.by(() => { void localeTick; return typingText ?? (config ?? aparteGlobalConfig).t('typing'); });

  // A parent write to `messages` reaches the transcript — a reassignment, or a push / splice on
  // a bound $state array — unless it is the host's own emit coming back, current or stale:
  // applying it rolled back what a non-emitting call (appendMessage) had added since.
  //
  // Own emits are known by the ids they carried, keyed by the value Svelte stored, which is a
  // proxy of the emitted list (in a bare chat as under `bind:` on a $state), not the list itself.
  const emittedIds = new WeakMap<object, string[]>();
  const sameIds = (a: readonly (string | undefined)[], b: readonly (string | undefined)[]) =>
    a.length === b.length && a.every((id, i) => id === b[i]);
  let lastProp = untrack(() => messages);
  $effect.pre(() => {
    const next = messages;
    // Read every index: a push, a splice or an index write re-runs this, not only a reassignment.
    const items = [...next];
    untrack(() => {
      const ids = items.map((m) => m?.id);
      const own = emittedIds.get(next);
      if (own && sameIds(ids, own)) { lastProp = next; return; }
      if (next === lastProp && sameIds(ids, internalMessages.map((m) => m.id))) return;
      lastProp = next;
      internalMessages = items;
      if (items.length === 0) host?.clearRenderCache();
    });
  });

  // A waiting line the caller drives (the host may turn it off on the first token).
  let lastTyping = untrack(() => isTyping);
  $effect.pre(() => {
    if (isTyping === lastTyping) return;
    lastTyping = isTyping;
    typingActive = isTyping;
  });

  // The conversation id drives the host; the initial one is handed over at bind.
  let lastConv = untrack(() => conversationId);
  $effect(() => {
    const next = conversationId;
    if (next === lastConv) return;
    lastConv = next;
    untrack(() => { void host?.setConversationId(next ?? null); });
  });

  // The bubbles are rendered by this template; the host reconciles them after each change.
  $effect(() => {
    void internalMessages;
    untrack(() => { if (host) void tick().then(() => host?.syncBubbles()); });
  });

  // The composer's and the viewport's state are attributes core's elements read. Svelte 5
  // sets a template attribute as a PROPERTY when the element has one, and `''` through a
  // boolean setter reads as false, so presence attributes are written here explicitly.
  function toggleAttr(el: HTMLElement, name: string, on: boolean, value: string) {
    if (on) el.setAttribute(name, value); else el.removeAttribute(name);
  }
  $effect(() => { if (viewportRef) toggleAttr(viewportRef, 'loading', waiting, ''); });
  $effect(() => {
    if (!composerRef) return;
    composerRef.setAttribute('target', hostId);
    composerRef.setAttribute('placeholder', placeholder);
    toggleAttr(composerRef, 'disabled', disabled || waiting, '');
    toggleAttr(composerRef, 'submit-on-enter', !submitOnEnter, 'false');
  });

  function handleSend(event: Event) {
    (viewportRef as unknown as { requestSmoothScroll?: () => void })?.requestSmoothScroll?.();
    onmessageSent?.((event as CustomEvent<AparteSendEventDetail>).detail);
  }

  // Custom bubble actions bubble to the root as `aparte-action`.
  function handleAction(event: Event) {
    onaction?.((event as CustomEvent<AparteActionEventDetail>).detail);
  }

  onMount(() => {
    // The elements a server render left waiting are upgraded first: the host talks to them.
    releaseDeferredHydration(rootRef);
    const unsubscribeLocale = (config ?? aparteGlobalConfig).subscribe(() => { localeTick += 1; });
    const binding: AparteChatHostBinding = {
      hostId,
      host: rootRef!,
      viewport: viewportRef ?? null,
      getMessages: () => internalMessages,
      setMessages: (m) => { internalMessages = m as AparteMessage[]; },
      onMessagesChange: (m) => {
        const list = m as AparteMessage[];
        const ids = list.map((x) => x.id);
        emittedIds.set(list, ids);
        messages = list;
        // What the effect above will read back: Svelte's proxy of `list`, or the parent's.
        const stored = untrack(() => messages);
        emittedIds.set(stored, ids);
        lastProp = stored;
        onmessagesChange?.(list);
      },
      onMessageAppended: (m) => { onmessageAppended?.(m as AparteMessage); },
      onTypingChange: (t) => { typingActive = t; ontypingChange?.(t); },
      onStreamingChange: () => { /* exposed via isStreaming() */ },
      afterRender: (cb) => { void tick().then(cb); },
      resetComposer: () => (composerRef as unknown as { reset?: () => void })?.reset?.(),
      onLoadingChange: (on) => { hostLoading = on; },
    };
    host = new AparteChatHost(binding, {
      layoutTransitionMs,
      conversationId: conversationId ?? null,
      onConversationCreated: (createdId) => { onconversationCreated?.(createdId); },
      config,
    });
    const unbind = host.bind();
    host.syncBubbles();
    rootRef?.addEventListener('aparte-action', handleAction);
    return () => {
      unsubscribeLocale();
      rootRef?.removeEventListener('aparte-action', handleAction);
      unbind();
      host = null;
    };
  });

  // ── Imperative API (bind:this) ──
  export function appendMessage(m: AparteMessage, options?: { historical?: boolean }) { host?.appendMessage(m, options); }
  export function updateMessage(messageId: string, u: Partial<AparteMessage>) { host?.updateMessage(messageId, u); }
  export function updateLastMessage(content: string, options?: { append?: boolean }) { host?.updateLastMessage(content, options); }
  export function addSegment(segment: AparteSegment) { host?.addSegment(segment); }
  export function updateSegment(segmentId: string, updates: Partial<AparteSegment>) { host?.updateSegment(segmentId, updates); }
  export function removeSegment(segmentId: string) { host?.removeSegment(segmentId); }
  export function appendToSegment(segmentId: string, content: string) { host?.appendToSegment(segmentId, content); }
  export function getMessages(): AparteMessage[] { return host?.getMessages() ?? internalMessages; }
  export function clearMessages(options?: { revokeAttachments?: boolean }) { host?.clearMessages(options); }
  export function addBranch(messageId: string): number { return host?.addBranch(messageId) ?? 0; }
  export function addSiblingOf(existingId: string, message: AparteMessage): string | null { return host?.addSiblingOf(existingId, message) ?? null; }
  export function truncateFrom(messageId: string) { host?.truncateFrom(messageId); }
  export function truncateResponsesAfter(userMessageId: string) { host?.truncateResponsesAfter(userMessageId); }
  export function injectTokenStream(messageId: string, tokens: AsyncIterable<string>): Promise<void> {
    return host?.streamTokens(messageId, tokens) ?? Promise.resolve();
  }
  export function stopTokenStream() { host?.stopTokenStream(); }
  export function setConversationId(next: string | null): Promise<void> { return host?.setConversationId(next) ?? Promise.resolve(); }
  export function scrollToBottom() { (viewportRef as unknown as { scrollToBottom?: () => void })?.scrollToBottom?.(); }
  /** The `<aparte-chat-viewport>` element — the same accessor on all four wrappers. */
  export function getViewport(): HTMLElement | null { return viewportRef ?? null; }
  export function focusInput() { (composerRef as unknown as { focus?: () => void })?.focus?.(); }
  export function isStreaming(): boolean { return host?.isStreaming ?? false; }

  // Compile-time parity with the canonical API: a dropped or mistyped method is a build error.
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
  {...(serverRender ? { 'defer-hydration': '' } : {})}
  {...(overlayComposer ? { 'overlay-composer': '' } : {})}
  data-aparte-empty={centerWhenEmpty && internalMessages.length === 0 && !waiting ? '' : null}
  id={hostId}
  bind:this={rootRef}
>
  <aparte-chat-viewport bind:this={viewportRef} framework-managed="">
    {#if waiting}
      <div class="aparte-viewport-loading" aria-hidden="true">
        <span class="aparte-skeleton aparte-skeleton--rect aparte-viewport-loading__user"></span>
        <span class="aparte-skeleton aparte-skeleton--text"></span>
        <span class="aparte-skeleton aparte-skeleton--text"></span>
        <span class="aparte-skeleton aparte-skeleton--text"></span>
        <span class="aparte-skeleton aparte-skeleton--text aparte-viewport-loading__last"></span>
      </div>
      <span class="aparte-viewport-loading-status aparte-sr-only" role="status">{loadingText}</span>
    {/if}
    {#if internalMessages.length === 0 && !waiting}
      {@render emptyState?.()}
    {/if}
    {#each internalMessages as m (m.id)}
      {#if bubble}
        {@render bubble(m)}
      {:else}
        <aparte-chat-bubble
          message-id={m.id}
          data-role={m.role}
          data-kind={m.compaction ? 'compaction' : undefined}
          timestamp={m.timestamp}
          content={m.content}
          streaming={isAwaitingReply(m) ? '' : null}></aparte-chat-bubble>
      {/if}
    {/each}
    <aparte-chat-status visible={typingActive ? '' : null} text={typingLabel}></aparte-chat-status>
  </aparte-chat-viewport>

  {#if elicitation}<aparte-elicitation></aparte-elicitation>{/if}

  {@render aboveComposer?.()}

  <aparte-composer bind:this={composerRef} onaparte-send={handleSend}>
    {#if composer}
      {@render composer()}
    {:else}
      <div class="aparte-composer-shell">
        {#if attachments}<aparte-composer-attachments></aparte-composer-attachments>{/if}
        <div class="aparte-composer-row">
          {#if attachments}<aparte-composer-add-attachment></aparte-composer-add-attachment>{/if}
          <aparte-composer-input></aparte-composer-input>
          <aparte-composer-send></aparte-composer-send>
        </div>
        {#if toolbar}
          <aparte-composer-toolbar>{@render toolbar()}</aparte-composer-toolbar>
        {/if}
      </div>
    {/if}
  </aparte-composer>
</div>
