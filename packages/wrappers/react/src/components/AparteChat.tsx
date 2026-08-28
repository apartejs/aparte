'use client';

import React, {
    useEffect,
    useId,
    useRef,
    useState,
    forwardRef,
    useImperativeHandle,
} from 'react';
import { AparteChatHost, isAwaitingReply, type AparteChatHostBinding, type AparteConfig, type AparteChatImperativeApi } from '@aparte/core';
import type { AparteMessage, AparteSendEventDetail, AparteActionEventDetail } from '../types.js';

export interface AparteChatProps {
    /**
     * The host element's `id`, and therefore the `targetId` every event this chat
     * dispatches carries.
     *
     * Generated when omitted, which is the right default — but it used to be
     * generated and neither accepted nor exposed, so
     * `AparteClientOptions.scopeToTargetId` (the documented way to run several
     * independent clients on one page) was unreachable from this component: there
     * was no way to learn the id the client had to match. Angular exposed it; React,
     * Vue and Svelte did not.
     */
    id?: string;

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
     * Add the file picker + chips strip to the default composer shell. **Off by
     * default**, because the capability needs a host that consumes the files: an
     * `AparteClient` inlines them per its `rawFileInject` option, but if you drive
     * your own loop you must read `event.files` in `onMessageSent` — otherwise the
     * file the user deliberately attached is dropped in silence. No effect when you
     * pass your own `composer` (drop `<aparte-composer-add-attachment>` and
     * `<aparte-composer-attachments>` in it yourself).
     */
    attachments?: boolean;
    /**
     * Render the `<aparte-elicitation>` presenter inside the host — **on by default**,
     * as it is in `<aparte-chat>`: the built-in approval gate and `requestUserInput()`
     * ask through it, and it renders nothing until something asks. Pass `false` when
     * you mount a presenter of your own (`setElicitationPresenter`) or place the element
     * yourself. The first consumer to hit this appended the element by hand next to the
     * React tree, guided by a warning that named an `<aparte-chat>` this wrapper does not
     * render.
     */
    elicitation?: boolean;
    /** Extra class names for the root element (`[data-aparte-chat]`), merged after core's own. */
    className?: string;
    /** Inline style for the root element (`[data-aparte-chat]`). */
    style?: React.CSSProperties;
    /**
     * Active conversation id. When set, the wrapper loads/persists via the
     * `AparteConversationManager` registered in `aparteGlobalConfig` (set `null` to deselect).
     */
    conversationId?: string | null;
    /**
     * Custom composer content, rendered inside `<aparte-composer>` in place of the
     * default shell (input · send, plus the attachment primitives when
     * `attachments` is set). Compose the headless
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
    /**
     * The composer's bottom row — a mode picker, a model selector, a token counter.
     * Rendered inside core's `<aparte-composer-toolbar>`; nothing is rendered at all
     * when you pass nothing, so an unused row never draws its separator.
     *
     * **Placement is the DOM order.** There is no left/center/right slot: put things in
     * the order you want them, and push a control (with everything after it) to the end
     * with `margin-inline-start: auto`. That is a logical property, so the row reads
     * correctly in a right-to-left locale with no extra work.
     *
     * Ignored when a full custom `composer` replaces the shell.
     *
     * @example
     * <AparteChat
     *   messages={messages}
     *   onMessagesChange={setMessages}
     *   toolbar={<>
     *     <ModePicker value={mode} onChange={setMode} />
     *     <ModelSelector style={{ marginInlineStart: 'auto' }} />
     *   </>}
     * />
     */
    toolbar?: React.ReactNode;

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
     * `aparteGlobalConfig.registerAction` with `zones: ['bubble']`) is clicked — a typed
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
     * Instance {@link AparteConfig} for this chat. When set, every aparté
     * component rendered inside resolves THIS config instead of the global
     * `aparteGlobalConfig` — letting several independently-configured chats
     * (different providers, tools, renderers) coexist on one page. Omit for the
     * global config. Read once when the host mounts.
     */
    config?: AparteConfig;
}

/**
 * The omitted-prop default, hoisted out of the render: a destructuring default
 * `messages = []` is a NEW array on every render, and the parent-push effect below
 * compares by identity — so an uncontrolled `<AparteChat>` applied an empty list on
 * every render, wiping its own thread, and looped. One module-level array is safe to
 * share across instances: it is never mutated (the host replaces the list).
 */
const NO_MESSAGES: AparteMessage[] = [];

export const AparteChat = forwardRef<AparteChatImperativeApi, AparteChatProps>(function AparteChat(
    {
        messages = NO_MESSAGES,
        placeholder = 'Type a message...',
        disabled = false,
        isTyping = false,
        typingText = 'Assistant is thinking...',
        submitOnEnter = true,
        layoutTransitionMs = 0,
        centerWhenEmpty = false,
        attachments = false,
        elicitation = true,
        className,
        style,
        conversationId = null,
        composer,
        renderBubble,
        emptyState,
        aboveComposer,
        toolbar,
        config,
        onMessageSent,
        onAction,
        onMessagesChange,
        onMessageAppended,
        onTypingChange,
        onConversationCreated,
        id: providedId,
    },
    ref,
) {
    // useId() is SSR-stable (server and client agree), so no hydration mismatch.
    // Strip ':' so the id is also safe in CSS/querySelector, not just getElementById.
    // A caller-supplied id wins, so `scopeToTargetId` has something to match.
    const generatedId = `aparte-chat-${useId().replace(/:/g, '')}`;
    const hostId = providedId ?? generatedId;
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

    useImperativeHandle(ref, (): AparteChatImperativeApi => ({
        appendMessage: (m, o) => hostRef.current?.appendMessage(m, o),
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
            className={`aparte-chat-container${centerWhenEmpty ? ' aparte-chat-container--auto-center' : ''}${className ? ` ${className}` : ''}`}
            style={style}
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
                                streaming={isAwaitingReply(m) ? '' : undefined}
                            />
                        )
                ))}
                <aparte-chat-status visible={typingActive ? '' : undefined} text={typingText} />
            </aparte-chat-viewport>

            {elicitation && <aparte-elicitation />}

            {aboveComposer}

            <aparte-composer
                ref={composerRef as React.Ref<HTMLElement>}
                target={hostId}
                submit-on-enter={submitOnEnter ? undefined : 'false'}
            >
                {composer ?? (
                    <div className="aparte-composer-shell">
                        {attachments && <aparte-composer-attachments />}
                        <div className="aparte-composer-row">
                            {attachments && <aparte-composer-add-attachment />}
                            <aparte-composer-input />
                            <aparte-composer-send />
                        </div>
                        {toolbar != null && (
                            <aparte-composer-toolbar>{toolbar}</aparte-composer-toolbar>
                        )}
                    </div>
                )}
            </aparte-composer>
        </div>
    );
});

AparteChat.displayName = 'AparteChat';
