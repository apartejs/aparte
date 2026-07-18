'use client';

import React, {
    useEffect,
    useId,
    useRef,
    useState,
    forwardRef,
    useImperativeHandle,
} from 'react';
import { AparteChatHost, type AparteChatHostBinding, type AparteConfigClass } from '@aparte/core';
import type { AparteMessage, AparteSegment, AparteSendEventDetail, AparteActionEventDetail } from '../types.js';

export interface AparteChatProps {
    /**
     * Messages on the active path. **Optional** — omit for an uncontrolled chat
     * that starts empty (defaults to `[]`); pass it together with
     * `onMessagesChange` to control the list from the parent.
     */
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
     * Opt in to the "centered composer when empty" layout: while the message
     * list is empty the composer sits vertically centered with the `emptyState`
     * content above it, then slides to the bottom on the first message (~0.3s).
     * Off by default — purely additive: adds the `aparte-chat-container--auto-center`
     * modifier + a `data-aparte-empty` attribute that the shipped `aparte.css` recipe
     * keys off. No effect unless you also render an `emptyState`.
     */
    centerWhenEmpty?: boolean;
    /**
     * Active conversation id. When set, the wrapper loads/persists via the
     * `ConversationManager` registered in `AparteConfig` (set `null` to deselect).
     */
    conversationId?: string | null;
    /**
     * Custom composer content, rendered inside `<aparte-composer>` in place of the
     * default shell (add-attachment · input · send). Compose the headless
     * `aparte-composer-*` primitives freely — e.g. a skin-specific layout. Omit for
     * the default shell. The `<aparte-composer>` element (and its placeholder /
     * disabled / submit-on-enter behaviour) is always provided by the wrapper.
     */
    composer?: React.ReactNode;
    /**
     * Render your OWN element per message in place of `<aparte-chat-bubble>`.
     * Opt-in — omit for the default bubble. The returned node is driven by the
     * reactive message list, so it updates live during streaming (no need to
     * implement any imperative interface): re-render from `message.content` /
     * `message.segments`. Note the built-in action bar (retry/edit/branch) and
     * the imperative streaming push are the native bubble's — a custom bubble
     * owns whatever it wires (it can dispatch `aparte-retry` etc. or call the
     * wrapper's imperative API).
     */
    renderBubble?: (message: AparteMessage) => React.ReactNode;
    /**
     * Welcome / placeholder content shown INSIDE the viewport while there are no
     * messages (a real "empty state" region, not a workaround via `aboveComposer`).
     * Replaced by the message list on the first message.
     */
    emptyState?: React.ReactNode;
    /**
     * Content rendered ABOVE the composer (e.g. a disclaimer banner, a
     * "scroll to bottom" affordance, a context chip). Ignored when a full
     * custom `composer` replaces the shell.
     */
    aboveComposer?: React.ReactNode;
    /** Footer content, left slot — rendered in the default shell's footer row. */
    footerLeft?: React.ReactNode;
    /** Footer content, center slot. */
    footerCenter?: React.ReactNode;
    /** Footer content, right slot (e.g. a model selector or token counter). */
    footerRight?: React.ReactNode;

    /**
     * Notification that the user submitted a message from the composer. The
     * user's message is **appended to the thread automatically** (optimistic UI)
     * before this fires — do NOT add it again here. In an uncontrolled chat,
     * appending it duplicates it; in a controlled chat, mirror it into your own
     * `messages`. Use this for side-effects: scroll, analytics, backend send.
     */
    onMessageSent?: (event: AparteSendEventDetail) => void;
    /**
     * Fired when a custom bubble action (registered via
     * `AparteConfig.registerAction` with `zones: ['bubble']`) is clicked — a typed
     * wrapper over the bubbling `aparte-action` DOM event. Dispatch on `detail.actionId`.
     */
    onAction?: (detail: AparteActionEventDetail) => void;
    /**
     * Fired when the active message path changes (branch navigation / edit /
     * retry / streaming). Set the result back as the `messages` prop.
     */
    onMessagesChange?: (messages: AparteMessage[]) => void;
    /** Fired when a message is appended internally (e.g. by AparteClient). */
    onMessageAppended?: (message: AparteMessage) => void;
    /** Fired when the typing/"thinking" indicator should toggle. */
    onTypingChange?: (isTyping: boolean) => void;
    /** Fired when the controller lazily creates a conversation on first send. */
    onConversationCreated?: (id: string) => void;

    /**
     * Instance {@link AparteConfigClass} for this chat. When set, every aparté
     * component rendered inside resolves THIS config instead of the global
     * `AparteConfig` singleton — letting several independently-configured chats
     * (different providers, tools, renderers) coexist on one page. Omit for the
     * global config. Read once when the host mounts.
     */
    config?: AparteConfigClass;
}

export interface AparteChatHandle {
    // ── message + streaming surface (forwards to AparteChatHost) ──
    appendMessage: (message: AparteMessage) => void;
    updateMessage: (messageId: string, updates: Partial<AparteMessage>) => void;
    updateLastMessage: (content: string, options?: { append?: boolean }) => void;
    addSegment: (segment: AparteSegment) => void;
    updateSegment: (segmentId: string, updates: Partial<AparteSegment>) => void;
    removeSegment: (segmentId: string) => void;
    appendToSegment: (segmentId: string, content: string) => void;
    getMessages: () => AparteMessage[];
    clearMessages: () => void;
    // ── branch / edit ──
    addBranch: (messageId: string) => number;
    addSiblingOf: (existingId: string, message: AparteMessage) => string | null;
    truncateFrom: (messageId: string) => void;
    truncateResponsesAfter: (userMessageId: string) => void;
    // ── manual token streaming (agnostic AsyncIterable) ──
    injectTokenStream: (messageId: string, tokens: AsyncIterable<string>) => Promise<void>;
    stopTokenStream: () => void;
    // ── conversation lifecycle ──
    setConversationId: (id: string | null) => Promise<void>;
    // ── misc ──
    scrollToBottom: () => void;
    focusInput: () => void;
    isStreaming: () => boolean;
    /**
     * The `<aparte-chat-viewport>` element — for custom scroll handling, an
     * IntersectionObserver, etc. Same `getViewport()` accessor on all four
     * wrappers.
     */
    getViewport: () => HTMLElement | null;
}

export const AparteChat = forwardRef<AparteChatHandle, AparteChatProps>(function AparteChat(
    {
        messages = [],
        placeholder = 'Type a message...',
        disabled = false,
        isTyping = false,
        typingText = 'Assistant is thinking...',
        submitOnEnter = true,
        layoutTransitionMs = 0,
        centerWhenEmpty = false,
        conversationId = null,
        composer,
        renderBubble,
        emptyState,
        aboveComposer,
        footerLeft,
        footerCenter,
        footerRight,
        config,
        onMessageSent,
        onAction,
        onMessagesChange,
        onMessageAppended,
        onTypingChange,
        onConversationCreated,
    },
    ref,
) {
    // useId() is SSR-stable (server and client agree), so no hydration mismatch.
    // Strip ':' so the id is also safe in CSS/querySelector, not just getElementById.
    const hostId = `aparte-chat-${useId().replace(/:/g, '')}`;
    const hostElRef = useRef<HTMLDivElement>(null);
    const viewportRef = useRef<HTMLElement>(null);
    const composerRef = useRef<HTMLElement>(null);

    // Authoritative message list lives in a ref (the host reads it synchronously);
    // `renderMessages` state drives the declarative bubble list.
    const messagesRef = useRef<AparteMessage[]>(messages);
    const [renderMessages, setRenderMessages] = useState<AparteMessage[]>(messages);
    const [typingActive, setTypingActive] = useState(isTyping);
    const [, setIsStreaming] = useState(false);

    const hostRef = useRef<AparteChatHost | null>(null);
    const lastConvRef = useRef<string | null>(conversationId);

    // Keep the latest prop callbacks in a ref so the host's stable binding always
    // calls the current handlers without recreating the host.
    const cbRef = useRef({ onMessageSent, onAction, onMessagesChange, onMessageAppended, onTypingChange, onConversationCreated });
    cbRef.current = { onMessageSent, onAction, onMessagesChange, onMessageAppended, onTypingChange, onConversationCreated };

    const applyMessages = (m: AparteMessage[]) => {
        messagesRef.current = m;
        setRenderMessages(m);
    };

    // Create the host once after mount.
    useEffect(() => {
        const host = hostElRef.current;
        if (!host) return;
        const binding: AparteChatHostBinding = {
            hostId,
            host,
            viewport: viewportRef.current,
            getMessages: () => messagesRef.current,
            setMessages: (m) => applyMessages(m as AparteMessage[]),
            onMessagesChange: (m) => cbRef.current.onMessagesChange?.(m as AparteMessage[]),
            onMessageAppended: (m) => cbRef.current.onMessageAppended?.(m as AparteMessage),
            onTypingChange: (t) => { setTypingActive(t); cbRef.current.onTypingChange?.(t); },
            onStreamingChange: (id) => setIsStreaming(id !== null),
            afterRender: (cb) => { requestAnimationFrame(() => cb()); },
            resetComposer: () => (composerRef.current as unknown as { reset?: () => void })?.reset?.(),
        };
        const h = new AparteChatHost(binding, {
            layoutTransitionMs,
            conversationId: conversationId ?? null,
            onConversationCreated: (id) => cbRef.current.onConversationCreated?.(id),
            config,
        });
        hostRef.current = h;
        const teardown = h.bind();
        return () => { teardown(); hostRef.current = null; };
        // The host is created once per mount (keyed by the stable hostId); prop
        // changes flow through cbRef / dedicated effects, not by recreating it.
    }, [hostId]);

    // Parent push: sync the prop into the authoritative list. Guarded by ref
    // identity so the host's own emit→parent→prop round-trip doesn't loop.
    useEffect(() => {
        if (messages === messagesRef.current) return;
        applyMessages(messages);
        if (messages.length === 0) hostRef.current?.clearRenderCache();
    }, [messages]);

    // Reconcile bubbles whenever the rendered list changes (the host queries the
    // DOM for `<aparte-chat-bubble message-id>` elements and pushes segments).
    useEffect(() => { hostRef.current?.syncBubbles(); }, [renderMessages]);

    // Controlled typing indicator: reflect the prop, while the host may flip it
    // off internally on the first streamed token.
    useEffect(() => { setTypingActive(isTyping); }, [isTyping]);

    // Conversation id changes (the initial value is loaded by the host on bind).
    useEffect(() => {
        if (conversationId === lastConvRef.current) return;
        lastConvRef.current = conversationId;
        void hostRef.current?.setConversationId(conversationId ?? null);
    }, [conversationId]);

    // Surface composer sends to the consumer (the controller handles the
    // conversation side separately via its own host listener).
    useEffect(() => {
        const composer = composerRef.current;
        if (!composer) return;
        const onSend = (e: Event) => {
            (viewportRef.current as unknown as { requestSmoothScroll?: () => void })?.requestSmoothScroll?.();
            cbRef.current.onMessageSent?.((e as CustomEvent<AparteSendEventDetail>).detail);
        };
        composer.addEventListener('aparte-send', onSend);
        return () => composer.removeEventListener('aparte-send', onSend);
    }, []);

    // aparte-composer exposes `placeholder`/`disabled` as GETTER-ONLY accessors.
    // React 19 sets matching props as PROPERTIES on custom elements, which throws
    // ("Cannot set property placeholder ... which has only a getter"). Set them as
    // attributes imperatively instead (the getter reads the attribute).
    useEffect(() => {
        const composer = composerRef.current;
        if (!composer) return;
        composer.setAttribute('placeholder', placeholder);
        if (disabled) composer.setAttribute('disabled', '');
        else composer.removeAttribute('disabled');
    }, [placeholder, disabled]);

    // Custom bubble actions bubble to the host root as `aparte-action`; surface them
    // as a typed prop.
    useEffect(() => {
        const host = hostElRef.current;
        if (!host) return;
        const onAct = (e: Event) => cbRef.current.onAction?.((e as CustomEvent<AparteActionEventDetail>).detail);
        host.addEventListener('aparte-action', onAct);
        return () => host.removeEventListener('aparte-action', onAct);
    }, []);

    useImperativeHandle(ref, (): AparteChatHandle => ({
        appendMessage: (m) => hostRef.current?.appendMessage(m),
        updateMessage: (id, u) => hostRef.current?.updateMessage(id, u),
        updateLastMessage: (c, o) => hostRef.current?.updateLastMessage(c, o),
        addSegment: (s) => hostRef.current?.addSegment(s),
        updateSegment: (id, u) => hostRef.current?.updateSegment(id, u),
        removeSegment: (id) => hostRef.current?.removeSegment(id),
        appendToSegment: (id, c) => hostRef.current?.appendToSegment(id, c),
        getMessages: () => hostRef.current?.getMessages() ?? messagesRef.current,
        clearMessages: () => hostRef.current?.clearMessages(),
        addBranch: (id) => hostRef.current?.addBranch(id) ?? 0,
        addSiblingOf: (id, m) => hostRef.current?.addSiblingOf(id, m) ?? null,
        truncateFrom: (id) => hostRef.current?.truncateFrom(id),
        truncateResponsesAfter: (id) => hostRef.current?.truncateResponsesAfter(id),
        injectTokenStream: (id, tokens) => hostRef.current?.streamTokens(id, tokens) ?? Promise.resolve(),
        stopTokenStream: () => hostRef.current?.stopTokenStream(),
        setConversationId: (id) => hostRef.current?.setConversationId(id) ?? Promise.resolve(),
        scrollToBottom: () => (viewportRef.current as unknown as { scrollToBottom?: () => void })?.scrollToBottom?.(),
        focusInput: () => (composerRef.current as unknown as { focus?: () => void })?.focus?.(),
        isStreaming: () => hostRef.current?.isStreaming ?? false,
        getViewport: () => viewportRef.current,
    }), []);

    return (
        <div
            className={`aparte-chat-container${centerWhenEmpty ? ' aparte-chat-container--auto-center' : ''}`}
            data-aparte-chat=""
            data-aparte-empty={centerWhenEmpty && renderMessages.length === 0 ? '' : undefined}
            id={hostId}
            ref={hostElRef}
        >
            <aparte-chat-viewport ref={viewportRef as React.Ref<HTMLElement>} framework-managed="">
                {renderMessages.length === 0 && emptyState}
                {renderMessages.map((m) => (
                    renderBubble
                        ? <React.Fragment key={m.id}>{renderBubble(m)}</React.Fragment>
                        : (
                            <aparte-chat-bubble
                                key={m.id}
                                message-id={m.id}
                                data-role={m.role}
                                timestamp={m.timestamp}
                                content={m.content}
                                streaming={m.status === 'streaming' || m.status === 'pending' ? '' : undefined}
                            />
                        )
                ))}
                <aparte-chat-status visible={typingActive ? '' : undefined} text={typingText} />
            </aparte-chat-viewport>

            {aboveComposer}

            <aparte-composer
                ref={composerRef as React.Ref<HTMLElement>}
                target={hostId}
                submit-on-enter={submitOnEnter ? undefined : 'false'}
            >
                {composer ?? (
                    <div className="aparte-composer-shell">
                        <aparte-composer-attachments />
                        <div className="aparte-composer-row">
                            <aparte-composer-add-attachment />
                            <aparte-composer-input />
                            <aparte-composer-send />
                        </div>
                        {(footerLeft != null || footerCenter != null || footerRight != null) && (
                            <div className="aparte-composer-footer">
                                {footerLeft}
                                {footerCenter}
                                {footerRight}
                            </div>
                        )}
                    </div>
                )}
            </aparte-composer>
        </div>
    );
});

AparteChat.displayName = 'AparteChat';
