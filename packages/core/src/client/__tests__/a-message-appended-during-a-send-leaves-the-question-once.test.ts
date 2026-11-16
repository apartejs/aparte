// @vitest-environment jsdom
/**
 * A send finds its own question by id, not by position.
 *
 * The request is built after the client awaited the key (and, on a compaction, again
 * after the summary): an app may append a message in that window — an advisor's reply,
 * another participant's message. The history used to be cut from the END of the path
 * (the trailing in-flight reply, then one user message), so a message landing after the
 * pending reply left the question in the history, and the question went twice; a
 * user-side message was cut in its place and lost.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AparteConfig, aparteGlobalConfig } from '../../config/aparte-config.js';
import { AparteClient } from '../aparte-client.js';
import type { AparteChatRequest } from '../../types/chat.js';
import type { AparteMessage, AparteStreamEvent } from '../../types/index.js';
import '../../components/viewport/aparte-chat-viewport.js';

type Viewport = HTMLElement & {
    getMessages(): AparteMessage[];
    appendMessage(message: AparteMessage): void;
    setMessages(messages: AparteMessage[]): void;
};

const textOf = (m: { content: unknown }): string => (typeof m.content === 'string' ? m.content : JSON.stringify(m.content));
/** How many times the question appears in the whole request — merged messages included. */
const asked = (request: AparteChatRequest): number => request.messages.map(textOf).join(' | ').split('the question').length - 1;

describe('a message appended while a send is being prepared', () => {
    let viewport: Viewport;
    let config: AparteConfig;
    let seen: AparteChatRequest[];
    let client: AparteClient;
    let release: (key: string) => void;

    beforeEach(async () => {
        document.body.innerHTML = '<aparte-chat-viewport id="chat"></aparte-chat-viewport>';
        viewport = document.getElementById('chat') as unknown as Viewport;
        await vi.waitFor(() => expect(typeof viewport.getMessages).toBe('function'));
        config = new AparteConfig();
        config.registerAIProvider({
            id: 'mock', getMetadata: () => ({ id: 'mock', name: 'M' }),
            getModels: () => [{ id: 'm', name: 'M' }], chat: async () => '',
        } as never);
        config.setModelConfig({ defaultProvider: 'mock', defaultModel: 'm' });
        seen = [];
        config.setTransport({
            chat: async (_p: unknown, request: AparteChatRequest) => {
                seen.push(request);
                const events = [{ type: 'text', delta: 'Done.' }, { type: 'done' }] as AparteStreamEvent[];
                return new ReadableStream({ start(c) { for (const e of events) c.enqueue(e); c.close(); } });
            },
        } as never);
        const key = new Promise<string>((resolve) => { release = resolve; });
        client = new AparteClient({ config, autoRegister: false, keyResolver: () => key });
        client.start();
        viewport.setMessages([
            { id: 'u0', role: 'user', content: 'earlier question', timestamp: 1 },
            { id: 'a0', role: 'assistant', content: 'earlier answer', status: 'completed', timestamp: 2 },
        ]);
    });

    afterEach(() => {
        client.stop();
        document.body.innerHTML = '';
        aparteGlobalConfig.reset();
    });

    const sendAndAppend = async (appended: AparteMessage): Promise<AparteChatRequest> => {
        viewport.dispatchEvent(new CustomEvent('aparte-send', {
            detail: { content: 'the question', timestamp: Date.now(), targetId: 'chat' }, bubbles: true, composed: true,
        }));
        await vi.waitFor(() => expect(viewport.getMessages().some((m) => m.status === 'pending')).toBe(true));
        viewport.appendMessage(appended);
        release('k');
        await vi.waitFor(() => expect(seen).toHaveLength(1));
        return seen[0]!;
    };

    it('sends the question once when an advisor message arrives after the pending reply', async () => {
        const request = await sendAndAppend({ id: 'h1', role: 'assistant', author: { name: 'Marie', type: 'human' }, content: 'One sec', timestamp: 3 });
        const texts = request.messages.map(textOf);
        expect(asked(request)).toBe(1);
        expect(texts.at(-1)).toContain('the question');
    });

    it('writes the id of the message it echoes on the send detail', async () => {
        const detail = { content: 'the question', timestamp: Date.now(), targetId: 'chat' } as { messageId?: string };
        viewport.dispatchEvent(new CustomEvent('aparte-send', { detail, bubbles: true, composed: true }));
        await vi.waitFor(() => expect(viewport.getMessages().some((m) => m.status === 'pending')).toBe(true));
        const sent = viewport.getMessages().find((m) => m.role === 'user' && m.content === 'the question');
        expect(detail.messageId).toBe(sent!.id);
        release('k');
        await vi.waitFor(() => expect(seen).toHaveLength(1));
    });

    it("sends the question once and keeps another participant's message out of its place", async () => {
        const request = await sendAndAppend({ id: 'p1', role: 'user', author: { name: 'Alex', type: 'human', id: 'alex' }, content: 'me too', timestamp: 3 });
        const texts = request.messages.map(textOf);
        expect(asked(request)).toBe(1);
        expect(texts.some((t) => t.includes('earlier question'))).toBe(true);
    });
});
