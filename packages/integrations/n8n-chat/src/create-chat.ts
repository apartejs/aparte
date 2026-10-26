/**
 * createChat — n8n's chat widget, drawn by aparté, from the same call.
 *
 * The options are `@n8n/chat`'s, under its names and with its defaults, so a page swaps
 * the import and keeps its call: the same webhook, the same session key in the browser
 * (a visitor keeps their conversation across the switch), the same `--chat--*` variables
 * read by the n8n theme. What it adds is what the original lacks: a handle to open, close,
 * send and reset; a real new conversation; French; history without the tool steps; errors
 * that say what to change in n8n; and no style leaking into the page.
 */
import { AparteClient, AparteConfig, attachConfig, uuid } from '@aparte/core';
import type { AparteLauncher, AparteLocale, AparteMessage, AparteStreamRunner } from '@aparte/core';
import { setupMarkedStreamingProvider } from '@aparte/plugin-marked/streaming';
import { createN8nRunner, loadN8nHistory } from '@aparte/runner-n8n';
import { N8N_ICONS } from './icons.js';
import { BUILT_IN_INITIAL_MESSAGES, localeFor, stringsFor } from './strings.js';
import type { ChatStrings } from './strings.js';

/** `createChat`'s options: `@n8n/chat`'s, under its names and with its defaults. */
export interface ChatOptions {
    /** The Chat Trigger's production URL, the one that ends in `/chat`. */
    webhookUrl: string;
    /**
     * `headers` are sent with every request, read each time — so an object you change later
     * (a refreshed token) is honoured. `method` is accepted for compatibility: every request
     * is a POST, which is what n8n answers for streaming and files.
     */
    webhookConfig?: { method?: 'GET' | 'POST'; headers?: Record<string, string> };
    /**
     * Where the widget mounts: an element, or a selector. A selector that matches nothing
     * gets a `div` with that id (or class) at the end of the body.
     * @default '#n8n-chat'
     */
    target?: string | Element;
    /**
     * `'window'` floats a button in the corner that opens the chat; `'fullscreen'` fills the
     * target, which needs a height.
     * @default 'window'
     */
    mode?: 'window' | 'fullscreen';
    /**
     * The ✕ in the header, in window mode. It closes the chat; on a phone, where the open
     * chat covers the page, it is the way back.
     * @default true
     */
    showWindowCloseButton?: boolean;
    /** Show a screen with a "New Conversation" button before the chat. @default false */
    showWelcomeScreen?: boolean;
    /**
     * Keep the session in the browser (`localStorage`, key `n8n-chat/sessionId`, the one
     * n8n's widget uses) and show its earlier messages again on load. Needs the Chat
     * Trigger's *Load Previous Session* set to *From Memory*, its memory connected to the
     * trigger too. Off: each page load is a new conversation.
     * @default true
     */
    loadPreviousSession?: boolean;
    /** Use this session instead of the stored one (your app's conversation id). */
    sessionId?: string;
    /** @default 'chatInput', the Chat Trigger's */
    chatInputKey?: string;
    /** @default 'sessionId', the Chat Trigger's */
    chatSessionKey?: string;
    /**
     * The language: the chrome's words come from `i18n[defaultLanguage]` over the built-in
     * ones, the chat's own from aparté's locale. English and French ship.
     * @default 'en'
     */
    defaultLanguage?: string;
    /** Messages shown first, from the assistant; neither sent nor kept. @default n8n's two */
    initialMessages?: string[];
    /**
     * A conversation to show when n8n has none for the session — after the first messages,
     * as n8n's widget shows it. Shown, not sent: n8n's memory does not hold it.
     */
    messageHistory?: { text: string; sender: 'user' | 'bot' }[];
    /** Sent with every message, as `metadata` in the trigger's output. */
    metadata?: Record<string, unknown>;
    /** The chrome's words, by language, over the built-in ones. */
    i18n?: Record<string, Partial<ChatStrings>>;
    /**
     * The chat's own words — its buttons, its error card, its screen-reader names — for a
     * language aparté does not ship: an `AparteLocale` (see the localization guide).
     * @default English, or French for `defaultLanguage: 'fr'`
     */
    locale?: AparteLocale;
    /** Let the person attach files; n8n receives them as `files`. @default false */
    allowFileUploads?: boolean;
    /** What the file picker offers, as an `accept` list (`'image/*,.pdf'`). @default any */
    allowedFilesMimeTypes?: string;
    /** Accepted for compatibility: a streamed answer and a whole one are both read. */
    enableStreaming?: boolean;
    /** Called with the message before it is sent, and awaited. */
    beforeMessageSent?: (message: string) => void | Promise<void>;
    /** Called with the message and the answer's text once the answer is complete. */
    afterMessageSent?: (message: string, response?: string) => void | Promise<void>;
    /** Accepted for compatibility: n8n's widget never read it. Theme with CSS variables. */
    theme?: unknown;
    /**
     * Questions offered above the input until the first message, one press to send.
     * @default none
     */
    suggestions?: string[];
    /**
     * The color scheme: light like n8n's widget, dark, or the visitor's own.
     * @default 'light'
     */
    colorScheme?: 'light' | 'dark' | 'auto';
    /** Every request to n8n goes through it: a proxy, a test, a recorded demo. @default the global `fetch` */
    fetch?: typeof fetch;
}

/** What `createChat` returns: the widget, and what a page can do with it. */
export interface Chat {
    /** The widget's root element: `<aparte-launcher>` in window mode, a `div` in fullscreen. */
    readonly element: HTMLElement;
    /** The session the conversation runs in. */
    readonly sessionId: string;
    /** Open the chat (window mode). */
    open(): void;
    /** Close the chat (window mode). */
    close(): void;
    /** Open it when closed, close it when open (window mode). */
    toggle(): void;
    /** Send a message as the person. */
    send(text: string): void;
    /** Start a new conversation: a new session, the first messages again. */
    reset(): void;
    /** Remove the widget and stop its client. */
    destroy(): void;
    /** The same as `destroy()`, under the name of the Vue app n8n's widget returns. */
    unmount(): void;
}

const STORAGE_KEY = 'n8n-chat/sessionId';

type Viewport = HTMLElement & { setMessages(messages: AparteMessage[]): void };
type ChatElement = HTMLElement & { viewport: Viewport | null };
type Composer = HTMLElement & { setValue(value: string): void; submit(): void };

function read(key: string): string | undefined {
    try { return localStorage.getItem(key) ?? undefined; } catch { return undefined; }
}

function write(key: string, value: string): void {
    try { localStorage.setItem(key, value); } catch { /* storage blocked: the session lasts the page */ }
}

/** The mount point: the element, the selector's match, or a new one named after the selector. */
function resolveTarget(target: string | Element): Element {
    if (typeof target !== 'string') return target;
    const found = document.querySelector(target);
    if (found) return found;
    const el = document.createElement('div');
    if (target.startsWith('#')) el.id = target.slice(1);
    else if (target.startsWith('.')) el.className = target.slice(1);
    document.body.appendChild(el);
    return el;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K];
function el(tag: string, className?: string, text?: string): HTMLElement;
function el(tag: string, className?: string, text?: string): HTMLElement {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
}

let instances = 0;

/**
 * Mount n8n's chat widget, drawn by aparté: the same options as `@n8n/chat`'s
 * `createChat`, and a handle to drive it.
 *
 * @example
 * import { createChat } from '@aparte/n8n-chat';
 * import '@aparte/n8n-chat/style.css';
 *
 * createChat({ webhookUrl: 'https://your-n8n.example.com/webhook/<id>/chat' });
 */
export function createChat(options: ChatOptions): Chat {
    const mode = options.mode ?? 'window';
    const language = options.defaultLanguage ?? 'en';
    const strings = stringsFor(language, options.i18n);
    const loadPrevious = options.loadPreviousSession ?? true;
    const initial = options.initialMessages ?? BUILT_IN_INITIAL_MESSAGES[language.split('-')[0] ?? ''] ?? BUILT_IN_INITIAL_MESSAGES['en'] ?? [];
    const instance = ++instances;
    const titleId = `aparte-n8n-title-${instance}`;

    let sessionId = options.sessionId ?? (loadPrevious ? read(STORAGE_KEY) : undefined) ?? uuid();
    if (loadPrevious && !options.sessionId) write(STORAGE_KEY, sessionId);

    // ── The config: this widget's own, so nothing on the page's other chats changes ───────
    const config = new AparteConfig();
    config.setLocale(options.locale ?? localeFor(language));
    // n8n's look in the icons too: a filled bubble on the button, a chevron once open.
    config.registerIcons(N8N_ICONS);
    setupMarkedStreamingProvider(undefined, config);

    // ── The markup ─────────────────────────────────────────────────────────────────────
    const card = el('section', 'aparte-n8n__window');
    card.setAttribute('aria-labelledby', titleId);

    const header = el('header', 'aparte-n8n__header');
    const heading = el('div', 'aparte-n8n__heading');
    const title = el('p', 'aparte-n8n__title', strings.title);
    title.id = titleId;
    heading.append(title);
    if (strings.subtitle) heading.append(el('p', 'aparte-n8n__subtitle', strings.subtitle));
    header.append(heading);
    if (mode === 'window' && options.showWindowCloseButton !== false) {
        const close = el('button', 'aparte-btn aparte-btn--icon aparte-btn--ghost aparte-n8n__close');
        close.type = 'button';
        close.setAttribute('aria-label', strings.closeButtonTooltip);
        close.setAttribute('data-aparte-launcher-close', '');
        const icon = el('aparte-icon');
        icon.setAttribute('name', 'close');
        close.append(icon);
        header.append(close);
    }

    const chat = el('aparte-chat', 'aparte-n8n__chat') as ChatElement;
    // Named, so its composer and its client answer this chat alone on a page that has others.
    chat.id = `aparte-n8n-chat-${instance}`;
    const composer = el('aparte-composer') as Composer;
    composer.setAttribute('placeholder', strings.inputPlaceholder);
    let suggestions: HTMLElement | undefined;
    if (options.suggestions?.length) {
        suggestions = el('aparte-suggestions');
        suggestions.setAttribute('suggestions', JSON.stringify(options.suggestions.map((text) => ({ label: text, prompt: text }))));
        composer.append(suggestions);
    }
    const shell = el('div', 'aparte-composer-shell');
    const row = el('div', 'aparte-composer-row');
    row.append(el('aparte-composer-input'));
    if (options.allowFileUploads) {
        shell.append(el('aparte-composer-attachments'));
        const add = el('aparte-composer-add-attachment');
        if (options.allowedFilesMimeTypes) add.setAttribute('accept', options.allowedFilesMimeTypes);
        // After the input, beside send: where n8n's widget puts its paperclip.
        row.append(add);
    }
    row.append(el('aparte-composer-send'));
    shell.append(row);
    composer.append(shell);
    chat.append(el('aparte-chat-viewport'), composer);

    card.append(header, chat);
    if (strings.footer) card.append(el('p', 'aparte-n8n__footer', strings.footer));

    let welcome: HTMLElement | undefined;
    if (options.showWelcomeScreen) {
        welcome = el('div', 'aparte-n8n__welcome');
        const start = el('button', 'aparte-btn aparte-btn--primary aparte-btn--solid aparte-n8n__start', strings.getStarted);
        start.type = 'button';
        start.addEventListener('click', () => {
            welcome!.hidden = true;
            chat.hidden = false;
            chat.querySelector<HTMLElement & { focusEnd?: () => void }>('aparte-composer-input')?.focusEnd?.();
        });
        welcome.append(start);
        chat.hidden = true;
        card.insertBefore(welcome, chat);
    }

    let root: HTMLElement;
    if (mode === 'window') {
        root = el('aparte-launcher', 'aparte-n8n aparte-n8n--window');
        root.append(card);
    } else {
        root = el('div', 'aparte-n8n aparte-n8n--fullscreen');
        root.append(card);
    }
    const scheme = options.colorScheme ?? 'light';
    if (scheme !== 'auto') root.setAttribute('data-aparte-theme', scheme);
    attachConfig(root, config);
    resolveTarget(options.target ?? '#n8n-chat').append(root);

    // ── The conversation ───────────────────────────────────────────────────────────────
    const firstMessages = (): AparteMessage[] => initial.map((content, i) => ({
        id: `n8n-initial-${i}`, role: 'assistant', content, timestamp: Date.now() - initial.length + i, status: 'completed',
    }));
    const seeded = (): AparteMessage[] => (options.messageHistory ?? []).map((m, i) => ({
        id: `n8n-seed-${i}`, role: m.sender === 'user' ? 'user' : 'assistant', content: m.text, timestamp: Date.now(), status: 'completed',
    }));
    const show = (messages: AparteMessage[]) => chat.viewport?.setMessages(messages);
    show([...firstMessages(), ...seeded()]);
    if (options.messageHistory?.length && suggestions) suggestions.hidden = true;

    let loaded = 0;
    const loadHistory = () => {
        const ticket = ++loaded;
        void loadN8nHistory({
            webhookUrl: options.webhookUrl,
            sessionId,
            ...(options.metadata ? { metadata: options.metadata } : {}),
            ...(options.chatSessionKey ? { chatSessionKey: options.chatSessionKey } : {}),
            headers: () => ({ ...(options.webhookConfig?.headers ?? {}) }),
            ...(options.fetch ? { fetch: options.fetch } : {}),
        }).then((history) => {
            // A reset or a first message since: that conversation is the one on screen.
            if (ticket !== loaded || history.length === 0) return;
            if (suggestions) suggestions.hidden = true;
            show([...firstMessages(), ...history]);
        }, (error: unknown) => {
            console.warn(`[aparte] n8n: ${error instanceof Error ? error.message : String(error)}`);
        });
    };
    if (loadPrevious) loadHistory();

    // The person's message, for the hooks; and the suggestions go once they have asked.
    let lastSent = '';
    chat.addEventListener('aparte-send', (event) => {
        loaded++;
        lastSent = String((event as CustomEvent<{ content?: unknown }>).detail?.content ?? '');
        if (suggestions) suggestions.hidden = true;
    });

    const runner = createN8nRunner({
        webhookUrl: options.webhookUrl,
        sessionId: () => sessionId,
        headers: () => ({ ...(options.webhookConfig?.headers ?? {}) }),
        ...(options.fetch ? { fetch: options.fetch } : {}),
        ...(options.metadata ? { metadata: options.metadata } : {}),
        ...(options.chatInputKey ? { chatInputKey: options.chatInputKey } : {}),
        ...(options.chatSessionKey ? { chatSessionKey: options.chatSessionKey } : {}),
    });
    const streamRunner: AparteStreamRunner = async (opts) => {
        const message = lastSent;
        await options.beforeMessageSent?.(message);
        let reply = '';
        let done = false;
        const result = await runner({
            ...opts,
            emitter: (event) => {
                if (event.type === 'text-delta') reply += event.delta;
                if (event.type === 'run-done') done = true;
                opts.emitter(event);
            },
        });
        if (done) await options.afterMessageSent?.(message, reply);
        return result;
    };

    // n8n receives the files as files: none is inlined into the message as well.
    const client = new AparteClient({ config, streamRunner, rawFileInject: 'none' });
    client.start();

    const launcher = () => (mode === 'window' ? (root as AparteLauncher) : undefined);
    const destroy = () => {
        client.stop();
        root.remove();
    };

    return {
        element: root,
        get sessionId() { return sessionId; },
        open: () => launcher()?.show(),
        close: () => launcher()?.close(),
        toggle: () => launcher()?.toggle(),
        send: (text: string) => {
            if (welcome && !welcome.hidden) { welcome.hidden = true; chat.hidden = false; }
            composer.setValue(text);
            composer.submit();
        },
        reset: () => {
            loaded++;
            sessionId = options.sessionId ?? uuid();
            if (loadPrevious && !options.sessionId) write(STORAGE_KEY, sessionId);
            if (suggestions) suggestions.hidden = false;
            show(firstMessages());
        },
        destroy,
        unmount: destroy,
    };
}
