<script lang="ts">
  import { onMount, tick, untrack } from 'svelte';
  import { AparteChatHost, aparteGlobalConfig, authorTypeOf, isAwaitingReply, releaseDeferredHydration, type AparteChatHostBinding, type AparteChatImperativeApi, type AparteComposer } from '@aparte/core';
  import type { AparteMessage, AparteSegment } from '../types.js';
  import type { AparteChatProps } from './types.js';
  import { APARTE_CHAT_EVENT_BINDINGS } from '../generated/chat-events.js';

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
    typeToFocus = 'chat',
    stopKey,
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
    onmessagesChange,
    onmessageAppended,
    ontypingChange,
    onconversationCreated,
    // What is left is the chat's event callbacks (`AparteChatEventCallbacks`), read by name.
    ...rest
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
  // The reports the parent has not handed back yet, oldest first — the rule core's host applies
  // for the other wrappers (`takeEcho`), here by value AND ids: what comes back is a proxy of the
  // emitted list — the chat's own in a bare chat, the parent's under `bind:` or when the parent
  // writes it back into a deep $state (a new proxy each time: Svelte keeps no cache) — and a
  // proxy the parent mutated in place keeps its identity, not its ids. A report that comes back,
  // however late, is taken with every older one; any other value is the parent's word and clears
  // them, so a list the parent restores later (a reopened conversation, an undo) is applied.
  //
  // Not core's `takeEcho`, measured rather than assumed: it matches by identity, which a proxy
  // never has, and matching on the ids alone — the comparator it could take — drops a list of
  // the parent's own with the same ids and other content, written while a report is on its way
  // back (an edit the parent makes). The values a report comes back as include the proxy the
  // parent stores, which only exists after the callback: core's queue cannot hold it.
  // `an-echo-is-known-by-value.test.ts` is that case.
  let pendingEchoes: Array<{ values: object[]; ids: string[] }> = [];
  const sameIds = (a: readonly (string | undefined)[], b: readonly (string | undefined)[]) =>
    a.length === b.length && a.every((id, i) => id === b[i]);
  function takeEcho(value: object, ids: readonly (string | undefined)[]): boolean {
    const i = pendingEchoes.findIndex((p) => p.values.includes(value) && sameIds(ids, p.ids));
    if (i < 0) { pendingEchoes = []; return false; }
    pendingEchoes.splice(0, i + 1);
    return true;
  }
  let lastProp = untrack(() => messages);
  $effect.pre(() => {
    const next = messages;
    // Read every index: a push, a splice or an index write re-runs this, not only a reassignment.
    const items = [...next];
    untrack(() => {
      const ids = items.map((m) => m?.id);
      if (takeEcho(next, ids)) { lastProp = next; return; }
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

  // The conversation id drives the host; the initial one is handed over at bind (this effect's
  // first run comes before onMount's, with no host yet). The host opens a new id, unless it is the
  // conversation the chat already shows or is creating: the id handed back from
  // `onconversationCreated`, or from `createConversations().activeId`, which names the new
  // conversation before the chat holds it — both arrive while the first reply streams.
  $effect(() => {
    const next = conversationId;
    untrack(() => { void host?.syncConversationId(next ?? null); });
  });

  // A new `config`: the host moves the chat to it once the turn in flight has ended (the first
  // run comes before onMount's, with no host yet: the host is created with it).
  $effect(() => {
    const next = config;
    untrack(() => host?.setConfig(next));
  });
  // The two labels follow the config's language, the new one's after a change.
  $effect(() => {
    const source = config ?? aparteGlobalConfig;
    return untrack(() => source.subscribe(() => { localeTick += 1; }));
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
    toggleAttr(composerRef, 'type-to-focus', typeToFocus !== 'chat', typeToFocus);
    toggleAttr(composerRef, 'stop-key', !!stopKey, stopKey ?? '');
  });

  // A send from the composer makes the next auto-scroll, the one that brings the user's bubble
  // in, a smooth one. `onmessageSent` is called below, with every other event.
  function handleSend() {
    (viewportRef as unknown as { requestSmoothScroll?: () => void })?.requestSmoothScroll?.();
  }

  // Every event of the chat, from the table generated out of `<aparte-chat>`'s own list: one
  // listener per event on the root, where they all arrive (the parts' bubble up to it, the
  // turn's lifecycle is sent on it). Each reads its callback off the props as they are NOW and
  // hands it the detail, then the event, which is what puts `preventDefault()` in reach. Added
  // once the host is bound, so the host's own listeners on the root run first and a callback
  // reads the chat as the event left it.
  type Callback = ((detail: unknown, event: Event) => void) | undefined;
  const forwarded = APARTE_CHAT_EVENT_BINDINGS.map(({ type, callback }) => ({
    type,
    listener: (event: Event) => (rest[callback] as Callback)?.((event as CustomEvent).detail, event),
  }));

  // What `rest` holds beyond the chat's own callbacks goes on the root element: an event core
  // has no callback for — `onaparte-subagent-open={…}`, a plugin's — is Svelte 5's event
  // attribute there, and heard where every event of the chat arrives.
  const own = new Set<string>(APARTE_CHAT_EVENT_BINDINGS.map((b) => b.callback));
  const rootAttrs = $derived(Object.fromEntries(Object.entries(rest).filter(([key]) => !own.has(key))));

  onMount(() => {
    // The elements a server render left waiting are upgraded first: the host talks to them.
    releaseDeferredHydration(rootRef);
    const binding: AparteChatHostBinding = {
      hostId,
      host: rootRef!,
      viewport: viewportRef ?? null,
      getMessages: () => internalMessages,
      setMessages: (m) => { internalMessages = m as AparteMessage[]; },
      onMessagesChange: (m) => {
        const list = m as AparteMessage[];
        const report = { values: [list as object], ids: list.map((x) => x.id) };
        pendingEchoes.push(report);
        if (pendingEchoes.length > 64) pendingEchoes.shift();
        messages = list;
        onmessagesChange?.(list);
        // What the effect above will read back — read AFTER the callback, so a write-back made
        // in it (`onmessagesChange={(m) => (msgs = m)}`) is the proxy recorded, not the one it
        // replaced. A write-back after an await lands later, as the parent's own word.
        const stored = untrack(() => messages);
        report.values.push(stored);
        lastProp = stored;
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
    const root = rootRef;
    for (const { type, listener } of forwarded) root?.addEventListener(type, listener);
    return () => {
      for (const { type, listener } of forwarded) root?.removeEventListener(type, listener);
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
  export function getConversationId(): string | null { return host?.getConversationId() ?? null; }
  export function scrollToBottom() { (viewportRef as unknown as { scrollToBottom?: () => void })?.scrollToBottom?.(); }
  /** The `<aparte-chat-viewport>` element — the same accessor on all four wrappers. */
  export function getViewport(): HTMLElement | null { return viewportRef ?? null; }
  /**
   * The chat's root element (`div[data-aparte-chat]`), where every event of the chat arrives.
   * An event core has no callback for — a plugin's — is `onaparte-some-event={…}` on the chat,
   * which lands here; this is the same element for `addEventListener`.
   */
  export function getElement(): HTMLElement | null { return rootRef ?? null; }
  /** The chat's `<aparte-composer>` element, for its methods and the events it sends. */
  export function getComposer(): AparteComposer | null { return (composerRef as AparteComposer | undefined) ?? null; }
  export function focusInput() { (composerRef as unknown as { focus?: () => void })?.focus?.(); }
  export function isStreaming(): boolean { return host?.isStreaming ?? false; }

  // Compile-time parity with the canonical API: a dropped or mistyped method is a build error.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  function _assertImperativeParity(): AparteChatImperativeApi {
    return {
      appendMessage, updateMessage, updateLastMessage, addSegment, updateSegment, removeSegment,
      appendToSegment, getMessages, clearMessages, addBranch, addSiblingOf, truncateFrom,
      truncateResponsesAfter, injectTokenStream, stopTokenStream, setConversationId, getConversationId,
      scrollToBottom, focusInput, isStreaming, getViewport, getElement, getComposer,
    };
  }
</script>

<div
  {...rootAttrs}
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
          data-kind={m.kind ?? (m.compaction ? 'compaction' : undefined)}
          name={m.author?.name}
          data-author-type={m.author ? authorTypeOf(m) : undefined}
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
