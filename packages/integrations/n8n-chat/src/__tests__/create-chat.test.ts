/**
 * createChat — n8n's widget, drawn by aparté, from `@n8n/chat`'s options.
 *
 * Real elements in jsdom over a scripted n8n: the fake `fetch` answers `sendMessage` with
 * a stream and `loadPreviousSession` with stored messages, the way a Chat Trigger does
 * (see @aparte/runner-n8n's recorded fixtures).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { AparteMessage } from '@aparte/core';
import { createChat } from '../index.js';
import type { Chat, ChatOptions } from '../index.js';

const URL_ = 'https://n8n.example.com/webhook/abc/chat';
const meta = { metadata: { nodeId: 'agent', nodeName: 'AI Agent', itemIndex: 0, runIndex: 0 } };
const stream = (text: string) => [
    { type: 'begin', ...meta },
    ...text.match(/.{1,4}/gs)!.map((content) => ({ type: 'item', content, ...meta })),
    { type: 'end', ...meta },
].map((frame) => JSON.stringify(frame)).join('\n') + '\n';

interface Sent { body: Record<string, unknown> | FormData; headers: Record<string, string> }

function n8n({ history = [] as unknown[], reply = 'We sell bread.' } = {}) {
    const sent: Sent[] = [];
    const fetch = vi.fn(async (_url: string, init: RequestInit) => {
        const body = typeof init.body === 'string' ? JSON.parse(init.body) as Record<string, unknown> : init.body as FormData;
        sent.push({ body, headers: { ...(init.headers as Record<string, string>) } });
        const action = body instanceof FormData ? body.get('action') : body['action'];
        const text = action === 'loadPreviousSession' ? JSON.stringify({ data: history }) : stream(reply);
        return new Response(text, { status: 200, headers: { 'content-type': 'application/json; charset=utf-8' } });
    });
    vi.stubGlobal('fetch', fetch);
    return { sent, fetch, actions: () => sent.map((s) => (s.body instanceof FormData ? s.body.get('action') : s.body['action'])) };
}

const human = (content: string) => ({ lc: 1, type: 'constructor', id: ['langchain_core', 'messages', 'HumanMessage'], kwargs: { content } });
const ai = (content: unknown, toolCalls: unknown[] = []) => ({ lc: 1, type: 'constructor', id: ['langchain_core', 'messages', 'AIMessage'], kwargs: { content, tool_calls: toolCalls } });

const messagesOf = (chat: Chat): AparteMessage[] =>
    (chat.element.querySelector('aparte-chat-viewport') as unknown as { getMessages(): AparteMessage[] }).getMessages();
/** A message's text: its content, or — for a streamed answer — its text segments. */
const textOf = (m: AparteMessage) => m.content || (m.segments ?? []).map((s) => (s.type === 'text' ? s.content : '')).join('');
const contents = (chat: Chat) => messagesOf(chat).map((m) => [m.role, textOf(m)]);

const chats: Chat[] = [];
function mount(options: Partial<ChatOptions> = {}): Chat {
    const chat = createChat({ webhookUrl: URL_, ...options });
    chats.push(chat);
    return chat;
}

beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = '';
});

afterEach(() => {
    for (const chat of chats.splice(0)) chat.destroy();
    vi.unstubAllGlobals();
});

describe('createChat: the widget, as n8n draws it', () => {
    it("mounts n8n's window in #n8n-chat — a button in the corner, the header and n8n's first messages", async () => {
        n8n();
        const chat = mount({ loadPreviousSession: false });
        const target = document.getElementById('n8n-chat')!;
        expect(target.parentElement).toBe(document.body);
        expect(chat.element.tagName).toBe('APARTE-LAUNCHER');
        expect(chat.element.classList.contains('aparte-n8n')).toBe(true);
        expect(target.contains(chat.element)).toBe(true);
        expect(chat.element.querySelector('.aparte-n8n__title')?.textContent).toBe('Hi there! 👋');
        expect(chat.element.querySelector('.aparte-n8n__subtitle')?.textContent).toBe("Start a chat. We're here to help you 24/7.");
        expect(chat.element.querySelector('aparte-composer')?.getAttribute('placeholder')).toBe('Type your question..');
        // n8n's widget draws no close button unless asked: the button in the corner closes it.
        expect(chat.element.querySelector('.aparte-n8n__close')).toBeNull();
        expect(chat.element.querySelector('.aparte-n8n__window')?.getAttribute('aria-labelledby')).toBe(chat.element.querySelector('.aparte-n8n__title')?.id);
        expect(contents(chat)).toEqual([['assistant', 'Hi there! 👋'], ['assistant', 'My name is Nathan. How can I assist you today?']]);
        // n8n's widget writes an h1 into the page; this one writes no heading at all.
        expect(chat.element.querySelector('h1, h2, h3')).toBeNull();
    });

    it('mounts in a target of yours, by element or by selector, and a full-page chat with no button and no close', () => {
        n8n();
        const host = document.createElement('main');
        document.body.append(host);
        const full = mount({ target: host, mode: 'fullscreen', loadPreviousSession: false });
        expect(full.element.parentElement).toBe(host);
        expect(full.element.tagName).toBe('DIV');
        expect(full.element.classList.contains('aparte-n8n--fullscreen')).toBe(true);
        expect(full.element.querySelector('.aparte-n8n__close')).toBeNull();
        full.open();
        full.close();
        full.toggle();
        const byClass = mount({ target: '.help', loadPreviousSession: false });
        expect(byClass.element.parentElement?.className).toBe('help');
    });

    it('opens, closes and toggles from the handle', () => {
        n8n();
        const chat = mount({ loadPreviousSession: false });
        expect(chat.element.hasAttribute('open')).toBe(false);
        chat.open();
        expect(chat.element.hasAttribute('open')).toBe(true);
        chat.toggle();
        expect(chat.element.hasAttribute('open')).toBe(false);
        chat.toggle();
        chat.close();
        expect(chat.element.hasAttribute('open')).toBe(false);
    });

    it('speaks French with defaultLanguage, under the words the page gives', () => {
        n8n();
        const chat = mount({ loadPreviousSession: false, defaultLanguage: 'fr', i18n: { fr: { title: 'Bienvenue chez Paul' } } });
        expect(chat.element.querySelector('.aparte-n8n__title')?.textContent).toBe('Bienvenue chez Paul');
        expect(chat.element.querySelector('.aparte-n8n__subtitle')?.textContent).toMatch(/^Démarrez une conversation/);
        expect(chat.element.querySelector('aparte-composer')?.getAttribute('placeholder')).toBe('Posez votre question…');
        expect(contents(chat)[1]).toEqual(['assistant', 'Je m’appelle Nathan. Comment puis-je vous aider ?']);
    });

    it("draws n8n's icons on its button — a filled bubble, a chevron once open — and nowhere else", () => {
        n8n();
        const chat = mount({ loadPreviousSession: false });
        const button = () => chat.element.querySelector('.aparte-launcher__button')!;
        expect(button().querySelector('svg path')?.getAttribute('d')).toMatch(/^M5\.5 3\.5h13/);
        chat.open();
        expect(button().querySelector('svg path')?.getAttribute('d')).toBe('m6 9.5 6 6 6-6');
        // The header's close button keeps the chat's own close icon.
        const withClose = mount({ loadPreviousSession: false, showWindowCloseButton: true, target: '#b' });
        expect(withClose.element.querySelector('.aparte-n8n__close')?.getAttribute('aria-label')).toBe('Close chat');
        expect(withClose.element.querySelector('.aparte-n8n__close aparte-icon')?.getAttribute('name')).toBe('close');
    });

    it('carries its language, and is a modal dialog while it covers a phone', () => {
        n8n();
        const matchMedia = window.matchMedia;
        window.matchMedia = ((query: string) => ({ matches: true, media: query, addEventListener: () => {}, removeEventListener: () => {} })) as unknown as typeof window.matchMedia;
        try {
            const chat = mount({ loadPreviousSession: false, defaultLanguage: 'fr' });
            expect(chat.element.getAttribute('lang')).toBe('fr');
            const card = chat.element.querySelector('.aparte-n8n__window')!;
            expect(card.getAttribute('role')).toBeNull();
            chat.open();
            expect(card.getAttribute('role')).toBe('dialog');
            expect(card.getAttribute('aria-modal')).toBe('true');
            chat.close();
            expect(card.getAttribute('role')).toBeNull();
        } finally {
            window.matchMedia = matchMedia;
        }
    });

    it('speaks a language aparté does not ship, from the locale it is given', async () => {
        n8n();
        const { APARTE_DEFAULT_LOCALE } = await import('@aparte/core');
        const chat = mount({ loadPreviousSession: false, defaultLanguage: 'nl', locale: { ...APARTE_DEFAULT_LOCALE, tag: 'nl', launcherOpen: 'Chat openen' }, i18n: { nl: { title: 'Hallo!' } } });
        expect(chat.element.querySelector('.aparte-launcher__button')?.getAttribute('aria-label')).toBe('Chat openen');
        expect(chat.element.querySelector('.aparte-n8n__title')?.textContent).toBe('Hallo!');
        // Its other words fall back to English.
        expect(chat.element.querySelector('aparte-composer')?.getAttribute('placeholder')).toBe('Type your question..');
    });

    it('loads the language it ships for the tag alone — German for de-AT — and switches the chat to it', async () => {
        n8n();
        const chat = mount({ loadPreviousSession: false, defaultLanguage: 'de-AT' });
        expect(chat.element.querySelector('.aparte-n8n__title')?.textContent).toBe('Hallo! 👋');
        expect(contents(chat)[1]).toEqual(['assistant', 'Ich heiße Nathan. Wie kann ich dir heute helfen?']);
        await vi.waitFor(() => expect(chat.element.querySelector('.aparte-launcher__button')?.getAttribute('aria-label')).toBe('Chat öffnen'));
        expect(chat.element.getAttribute('lang')).toBe('de-AT');
    });

    it('leaves the subtitle out when it is empty, shows a footer when there is one, and shows the given first messages', () => {
        n8n();
        const chat = mount({ loadPreviousSession: false, i18n: { en: { subtitle: '', footer: 'Answers by our assistant.' } }, initialMessages: ['Hello!'] });
        expect(chat.element.querySelector('.aparte-n8n__subtitle')).toBeNull();
        expect(chat.element.querySelector('.aparte-n8n__footer')?.textContent).toBe('Answers by our assistant.');
        expect(contents(chat)).toEqual([['assistant', 'Hello!']]);
    });

    it('offers file uploads only when asked, with the types it accepts', () => {
        n8n();
        const plain = mount({ loadPreviousSession: false });
        expect(plain.element.querySelector('aparte-composer-add-attachment')).toBeNull();
        const files = mount({ loadPreviousSession: false, allowFileUploads: true, allowedFilesMimeTypes: 'image/*,.pdf', target: '#other' });
        expect(files.element.querySelector('aparte-composer-add-attachment')?.getAttribute('accept')).toBe('image/*,.pdf');
        expect(files.element.querySelector('aparte-composer-attachments')).not.toBeNull();
    });

    it('is light like n8n by default, dark or the visitor\'s own on request', () => {
        n8n();
        expect(mount({ loadPreviousSession: false }).element.getAttribute('data-aparte-theme')).toBe('light');
        expect(mount({ loadPreviousSession: false, colorScheme: 'dark', target: '#b' }).element.getAttribute('data-aparte-theme')).toBe('dark');
        expect(mount({ loadPreviousSession: false, colorScheme: 'auto', target: '#c' }).element.hasAttribute('data-aparte-theme')).toBe(false);
    });

    it('starts on a welcome screen when asked, and its button opens the chat', () => {
        n8n();
        const chat = mount({ loadPreviousSession: false, showWelcomeScreen: true });
        const welcome = chat.element.querySelector<HTMLElement>('.aparte-n8n__welcome')!;
        const area = chat.element.querySelector<HTMLElement>('aparte-chat')!;
        expect(area.hidden).toBe(true);
        expect(welcome.querySelector('button')?.textContent).toBe('New Conversation');
        welcome.querySelector('button')!.click();
        expect(welcome.hidden).toBe(true);
        expect(area.hidden).toBe(false);
    });
});

describe('createChat: the conversation', () => {
    it('sends the message in the session, draws the answer, and calls the hooks with both', async () => {
        const { sent } = n8n({ reply: 'We sell sourdough and croissants.' });
        const before = vi.fn();
        const after = vi.fn();
        const chat = mount({ loadPreviousSession: false, metadata: { page: '/shop' }, beforeMessageSent: before, afterMessageSent: after });
        chat.send('What do you sell?');
        await vi.waitFor(() => expect(after).toHaveBeenCalled());
        expect(before).toHaveBeenCalledWith('What do you sell?');
        // Shaped like both of n8n's answers: a whole one's `output`, a streamed one's `message`.
        expect(after).toHaveBeenCalledWith('What do you sell?', { output: 'We sell sourdough and croissants.', message: 'We sell sourdough and croissants.', hasReceivedChunks: true });
        expect(sent[0]!.body).toEqual({ action: 'sendMessage', sessionId: chat.sessionId, chatInput: 'What do you sell?', metadata: { page: '/shop' } });
        await vi.waitFor(() => expect(contents(chat).at(-1)).toEqual(['assistant', 'We sell sourdough and croissants.']));
        expect(contents(chat).at(-2)).toEqual(['user', 'What do you sell?']);
    });

    it('reads the headers on every request, so a token the page refreshes is sent', async () => {
        const { sent } = n8n();
        const headers: Record<string, string> = { authorization: 'Bearer 1' };
        const after = vi.fn();
        const chat = mount({ loadPreviousSession: false, webhookConfig: { headers }, afterMessageSent: after });
        chat.send('one');
        await vi.waitFor(() => expect(after).toHaveBeenCalledTimes(1));
        headers['authorization'] = 'Bearer 2';
        chat.send('two');
        await vi.waitFor(() => expect(after).toHaveBeenCalledTimes(2));
        expect(sent.map((s) => s.headers['authorization'])).toEqual(['Bearer 1', 'Bearer 2']);
    });

    it('names the fields as the workflow reads them', async () => {
        const { sent } = n8n();
        const after = vi.fn();
        const chat = mount({ loadPreviousSession: false, chatInputKey: 'question', chatSessionKey: 'conversation', afterMessageSent: after });
        chat.send('hi');
        await vi.waitFor(() => expect(after).toHaveBeenCalled());
        expect(sent[0]!.body).toMatchObject({ question: 'hi', conversation: chat.sessionId });
    });

    it('offers the suggestions until the first message', async () => {
        n8n();
        const after = vi.fn();
        const chat = mount({ loadPreviousSession: false, suggestions: ['Opening hours?', 'Gluten-free?'], afterMessageSent: after });
        const suggestions = chat.element.querySelector<HTMLElement>('aparte-suggestions')!;
        expect(JSON.parse(suggestions.getAttribute('suggestions')!)).toEqual([
            { label: 'Opening hours?', prompt: 'Opening hours?' }, { label: 'Gluten-free?', prompt: 'Gluten-free?' },
        ]);
        expect(suggestions.hidden).toBe(false);
        chat.send('Opening hours?');
        expect(suggestions.hidden).toBe(true);
        await vi.waitFor(() => expect(after).toHaveBeenCalled());
        chat.reset();
        expect(suggestions.hidden).toBe(false);
    });
});

describe('createChat: the session, as n8n keeps it', () => {
    it("keeps the session where n8n's widget keeps it, so a visitor keeps their conversation across the switch", () => {
        n8n();
        localStorage.setItem('n8n-chat/sessionId', 'from-n8n-widget');
        const chat = mount();
        expect(chat.sessionId).toBe('from-n8n-widget');
        chat.destroy();
        localStorage.clear();
        const fresh = mount();
        expect(localStorage.getItem('n8n-chat/sessionId')).toBe(fresh.sessionId);
    });

    it("shows the session's earlier messages after the first ones, without a tool's steps", async () => {
        const { sent, actions } = n8n({ history: [
            human('What is 12 times 7.5?'),
            ai([], [{ name: 'Calculator', args: { input: '12 * 7.5' } }]),
            { lc: 1, type: 'constructor', id: ['langchain_core', 'messages', 'ToolMessage'], kwargs: { content: '[{"response":"90"}]' } },
            ai('12 times 7.5 is 90.'),
        ] });
        localStorage.setItem('n8n-chat/sessionId', 's-42');
        const chat = mount({ initialMessages: ['Hello!'] });
        chat.open();
        await vi.waitFor(() => expect(contents(chat)).toHaveLength(3));
        expect(actions()).toEqual(['loadPreviousSession']);
        expect(sent[0]!.body).toMatchObject({ sessionId: 's-42' });
        expect(contents(chat)).toEqual([['assistant', 'Hello!'], ['user', 'What is 12 times 7.5?'], ['assistant', '12 times 7.5 is 90.']]);
    });

    it('asks for the history when the window first opens, not on every page view; a full page asks at once', async () => {
        const { actions } = n8n();
        const chat = mount();
        await new Promise((resolve) => setTimeout(resolve, 20));
        expect(actions(), 'a page view alone reaches no n8n execution').toEqual([]);
        chat.open();
        await vi.waitFor(() => expect(actions()).toEqual(['loadPreviousSession']));
        chat.close();
        chat.open();
        await new Promise((resolve) => setTimeout(resolve, 20));
        expect(actions(), 'once').toEqual(['loadPreviousSession']);
        mount({ mode: 'fullscreen', target: '#full' });
        await vi.waitFor(() => expect(actions()).toEqual(['loadPreviousSession', 'loadPreviousSession']));
    });

    it('starts a new conversation on every load with loadPreviousSession off, and asks n8n nothing on load', () => {
        const { fetch } = n8n();
        const a = mount({ loadPreviousSession: false });
        const b = mount({ loadPreviousSession: false, target: '#b' });
        expect(a.sessionId).not.toBe(b.sessionId);
        expect(localStorage.getItem('n8n-chat/sessionId')).toBeNull();
        expect(fetch).not.toHaveBeenCalled();
    });

    it("runs in the session it is given, and never stores it", () => {
        n8n();
        const chat = mount({ sessionId: 'conv-7' });
        expect(chat.sessionId).toBe('conv-7');
        expect(localStorage.getItem('n8n-chat/sessionId')).toBeNull();
        chat.reset();
        expect(chat.sessionId).toBe('conv-7');
    });

    it('starts a new conversation on reset: a new session, stored, and the first messages again', async () => {
        n8n();
        const after = vi.fn();
        const chat = mount({ afterMessageSent: after });
        const first = chat.sessionId;
        chat.send('hello');
        await vi.waitFor(() => expect(after).toHaveBeenCalled());
        chat.reset();
        expect(chat.sessionId).not.toBe(first);
        expect(localStorage.getItem('n8n-chat/sessionId')).toBe(chat.sessionId);
        expect(contents(chat)).toEqual([['assistant', 'Hi there! 👋'], ['assistant', 'My name is Nathan. How can I assist you today?']]);
    });

    it('says on the console why the history could not load, and keeps the chat usable', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => new Response('{"code":0,"message":"Workflow could not be started!"}', { status: 500 })));
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const chat = mount();
        chat.open();
        await vi.waitFor(() => expect(warn).toHaveBeenCalled());
        expect(String(warn.mock.calls[0]![0])).toMatch(/connect the memory node to the Chat Trigger/);
        expect(contents(chat)).toHaveLength(2);
        warn.mockRestore();
    });

    it('shows messageHistory when n8n has no conversation for the session, and the stored one over it', async () => {
        n8n();
        const seed = [{ text: 'Do you deliver?', sender: 'user' as const }, { text: 'Within 5 km, yes.', sender: 'bot' as const }];
        const fresh = mount({ initialMessages: ['Hello!'], messageHistory: seed });
        expect(contents(fresh)).toEqual([['assistant', 'Hello!'], ['user', 'Do you deliver?'], ['assistant', 'Within 5 km, yes.']]);
        fresh.destroy();
        n8n({ history: [human('Earlier'), ai('Stored answer')] });
        const stored = mount({ initialMessages: ['Hello!'], messageHistory: seed, target: '#b' });
        stored.open();
        await vi.waitFor(() => expect(contents(stored)).toEqual([['assistant', 'Hello!'], ['user', 'Earlier'], ['assistant', 'Stored answer']]));
    });

    it('sends every request through the fetch it is given', async () => {
        const own = vi.fn(async (_url: string, init: RequestInit) => {
            const action = JSON.parse(String(init.body))['action'];
            return new Response(action === 'loadPreviousSession' ? '{"data":[]}' : stream('Through your fetch.'), { status: 200 });
        });
        const global = vi.fn();
        vi.stubGlobal('fetch', global);
        const after = vi.fn();
        const chat = mount({ fetch: own as unknown as typeof fetch, afterMessageSent: after });
        chat.send('hi');
        await vi.waitFor(() => expect(after).toHaveBeenCalledWith('hi', expect.objectContaining({ output: 'Through your fetch.' })));
        // Sent before the chat was ever opened: the message starts the conversation, no history is asked for.
        expect(own.mock.calls.map((c) => JSON.parse(String(c[1].body))['action'])).toEqual(['sendMessage']);
        expect(global).not.toHaveBeenCalled();
    });

    it('removes the widget on destroy, and unmount does the same', () => {
        n8n();
        const chat = mount({ loadPreviousSession: false });
        chat.unmount();
        expect(document.querySelector('.aparte-n8n')).toBeNull();
    });
});

describe('createChat: on a page with other chats, and while an answer is on its way', () => {
    /** A fetch whose answers wait until the test lets them go, so a turn can be caught in flight. */
    function heldN8n() {
        const sent: Record<string, unknown>[] = [];
        const releases: (() => void)[] = [];
        const fetch = vi.fn(async (_url: string, init: RequestInit) => {
            const body = JSON.parse(String(init.body)) as Record<string, unknown>;
            if (body['action'] === 'loadPreviousSession') return new Response('{"data":[]}', { status: 200 });
            sent.push(body);
            await new Promise<void>((resolve, reject) => {
                releases.push(resolve);
                init.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
            });
            return new Response(stream(`Answer to ${String(body['chatInput'])}.`), { status: 200 });
        });
        vi.stubGlobal('fetch', fetch);
        // Lets every answer waiting go: an aborted one ignores it.
        return { sent, release: () => { for (const go of releases.splice(0)) go(); }, fetch };
    }

    it("never answers the page's own chat, which belongs to the page", async () => {
        const { fetch } = n8n();
        mount({ loadPreviousSession: false });
        const page = document.createElement('aparte-chat');
        page.id = 'page-chat';
        document.body.append(page);
        page.dispatchEvent(new CustomEvent('aparte-send', { detail: { content: 'a question for the page', timestamp: Date.now(), targetId: 'page-chat' }, bubbles: true, composed: true }));
        await new Promise((resolve) => setTimeout(resolve, 20));
        expect(fetch).not.toHaveBeenCalled();
    });

    it('waits for the answer on its way before sending, and leaves what the person is typing alone', async () => {
        const held = heldN8n();
        const chat = mount({ loadPreviousSession: false });
        const composer = chat.element.querySelector('aparte-composer') as HTMLElement & { setValue(v: string): void; getValue?: () => string; value?: string };
        chat.send('first');
        await vi.waitFor(() => expect(held.sent).toHaveLength(1));
        composer.setValue('my draft');
        chat.send('second');
        await new Promise((resolve) => setTimeout(resolve, 20));
        expect(held.sent).toHaveLength(1);
        held.release();
        await vi.waitFor(() => expect(held.sent.map((b) => b['chatInput'])).toEqual(['first', 'second']));
        held.release();
        await vi.waitFor(() => expect(contents(chat).at(-1)).toEqual(['assistant', 'Answer to second.']));
        expect(chat.element.querySelector('aparte-composer-input')?.textContent ?? '').toContain('my draft');
    });

    it('stops the answer on its way on reset, and the next message starts the new session', async () => {
        const held = heldN8n();
        const after = vi.fn();
        const chat = mount({ loadPreviousSession: false, afterMessageSent: after });
        chat.send('first');
        await vi.waitFor(() => expect(held.sent).toHaveLength(1));
        const before = chat.sessionId;
        chat.reset();
        await new Promise((resolve) => setTimeout(resolve, 20));
        chat.send('again');
        await vi.waitFor(() => expect(held.sent).toHaveLength(2));
        expect(held.sent[1]!['sessionId']).toBe(chat.sessionId);
        expect(chat.sessionId).not.toBe(before);
        held.release();
        await vi.waitFor(() => expect(after).toHaveBeenCalledTimes(1));
        expect(after).toHaveBeenCalledWith('again', expect.anything());
    });

    it('sends nothing for a message whose beforeMessageSent was still running when the conversation was reset', async () => {
        const held = heldN8n();
        let letGo = () => {};
        const chat = mount({ loadPreviousSession: false, beforeMessageSent: () => new Promise<void>((resolve) => { letGo = resolve; }) });
        chat.send('old');
        await new Promise((resolve) => setTimeout(resolve, 20));
        chat.reset();
        letGo();
        await new Promise((resolve) => setTimeout(resolve, 20));
        expect(held.sent).toHaveLength(0);
    });

    it("tells a visitor in plain words, in their language, that n8n can't be reached — and the developer what to check", async () => {
        vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const chat = mount({ loadPreviousSession: false, defaultLanguage: 'fr' });
        chat.send('Bonjour ?');
        await vi.waitFor(() => expect(chat.element.querySelector('.aparte-segment-error')).not.toBeNull());
        const alert = chat.element.querySelector('.aparte-segment-error')!;
        expect(alert.textContent).toContain('L’assistant est injoignable pour le moment.');
        expect(alert.textContent).not.toContain('Failed to fetch');
        expect(alert.getAttribute('data-error-code')).toBe('NET_ERROR');
        expect(warn.mock.calls.map((c) => String(c[0])).some((m) => /Could not reach n8n at .*Allowed Origins/.test(m))).toBe(true);
        warn.mockRestore();
    });

    it('tells a visitor the answer took too long when a proxy gives up waiting', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => new Response('<html><body>504 Gateway Time-out</body></html>', { status: 504, headers: { 'content-type': 'text/html' } })));
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const chat = mount({ loadPreviousSession: false });
        chat.send('Still there?');
        await vi.waitFor(() => expect(chat.element.querySelector('.aparte-segment-error')).not.toBeNull());
        const alert = chat.element.querySelector('.aparte-segment-error')!;
        expect(alert.textContent).toContain('The answer took too long. Try again in a moment.');
        expect(alert.getAttribute('data-error-code')).toBe('NET_TIMEOUT');
        warn.mockRestore();
    });

    it('keeps a finished answer finished when afterMessageSent throws, and says so on the console', async () => {
        n8n({ reply: 'All good.' });
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const chat = mount({ loadPreviousSession: false, afterMessageSent: () => { throw new Error('analytics down'); } });
        chat.send('hello');
        await vi.waitFor(() => expect(warn).toHaveBeenCalledWith('[aparte] n8n: afterMessageSent threw:', expect.any(Error)));
        const last = messagesOf(chat).at(-1)!;
        expect(textOf(last)).toBe('All good.');
        expect(last.status).not.toBe('error');
        warn.mockRestore();
    });
});
