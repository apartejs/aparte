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
        expect(chat.element.querySelector('.aparte-n8n__close')?.getAttribute('aria-label')).toBe('Close chat');
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
        expect(after).toHaveBeenCalledWith('What do you sell?', 'We sell sourdough and croissants.');
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
        await vi.waitFor(() => expect(contents(chat)).toHaveLength(3));
        expect(actions()).toEqual(['loadPreviousSession']);
        expect(sent[0]!.body).toMatchObject({ sessionId: 's-42' });
        expect(contents(chat)).toEqual([['assistant', 'Hello!'], ['user', 'What is 12 times 7.5?'], ['assistant', '12 times 7.5 is 90.']]);
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
        await vi.waitFor(() => expect(warn).toHaveBeenCalled());
        expect(String(warn.mock.calls[0]![0])).toMatch(/connect the memory node to the Chat Trigger/);
        expect(contents(chat)).toHaveLength(2);
        warn.mockRestore();
    });

    it('removes the widget on destroy, and unmount does the same', () => {
        n8n();
        const chat = mount({ loadPreviousSession: false });
        chat.unmount();
        expect(document.querySelector('.aparte-n8n')).toBeNull();
    });
});
