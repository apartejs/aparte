// @vitest-environment jsdom
/**
 * End to end with a client: a message queued while a reply streams is answered once that
 * reply ends. The composer's own test proves the queue; this one proves the client takes the
 * queued send as a turn of its own, after closing the one it waited for, and asks the model
 * with it as the last thing the person said.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import '../components/composer/aparte-composer.js';
import type { AparteComposer } from '../components/composer/aparte-composer.js';
import { AparteClient } from '../client/aparte-client.js';
import { AparteConfig } from '../config/index.js';
import type { AparteChatRequest, AparteMessage, AparteSegment } from '../types/index.js';

describe('a message queued during a reply', () => {
    const started: AparteClient[] = [];
    afterEach(() => {
        for (const client of started.splice(0)) client.stop();
        document.body.innerHTML = '';
    });

    it('goes to the model once the reply ends, as the last thing the person said', async () => {
        const messages: AparteMessage[] = [];
        const viewport = document.createElement('aparte-chat-viewport');
        Object.assign(viewport as unknown as Record<string, unknown>, {
            appendMessage: (m: AparteMessage) => { messages.push(m); },
            getMessages: () => [...messages],
            updateMessage: (id: string, patch: Partial<AparteMessage>) => {
                const found = messages.find((m) => m.id === id);
                if (found) Object.assign(found, patch);
            },
            truncateResponsesAfter: () => {},
            // The reply's text is kept, so the history the next turn sends has an answer in it.
            addSegment: (segment: AparteSegment) => { const last = messages.at(-1)!; last.segments = [...(last.segments ?? []), { ...segment }]; },
            updateSegment: (id: string, patch: Partial<AparteSegment>) => {
                const found = messages.at(-1)?.segments?.find((x) => x.id === id);
                if (found) Object.assign(found, patch);
            },
            appendToSegment: (id: string, text: string) => {
                const found = messages.at(-1)?.segments?.find((x) => x.id === id) as { content?: string } | undefined;
                if (found) found.content = (found.content ?? '') + text;
            },
            setUsage: () => {},
        });
        const chat = document.createElement('aparte-chat');
        chat.id = 'chat-q';
        Object.defineProperty(chat, 'viewport', { value: viewport });
        chat.appendChild(viewport);
        const composer = document.createElement('aparte-composer') as AparteComposer;
        chat.appendChild(composer);
        document.body.appendChild(chat);
        await vi.waitFor(() => expect(typeof composer.streaming).toBe('boolean'));

        // The first reply stays open until the test lets it end.
        let endFirst!: () => void;
        const requests: AparteChatRequest[] = [];
        const cfg = new AparteConfig();
        cfg.registerAIProvider({ id: 'mock', getMetadata: () => ({ id: 'mock', name: 'M' }), getModels: () => [{ id: 'm', name: 'M' }] } as never);
        cfg.setKeyProvider(() => 'k');
        cfg.setModelConfig({ defaultProvider: 'mock', defaultModel: 'm' });
        cfg.setTransport({
            chat: (_provider: unknown, request: AparteChatRequest) => {
                requests.push(request);
                const first = requests.length === 1;
                return new ReadableStream({
                    async start(controller) {
                        if (first) {
                            controller.enqueue({ type: 'text', delta: 'an answer' });
                            await new Promise<void>((resolve) => { endFirst = resolve; });
                        }
                        controller.enqueue({ type: 'done' });
                        controller.close();
                    },
                });
            },
        } as never);
        const client = new AparteClient({ config: cfg, autoRegister: false });
        client.start();
        started.push(client);

        composer.setValue('first question');
        composer.submit();
        await vi.waitFor(() => expect(composer.streaming).toBe(true));

        composer.setValue('and a follow-up');
        composer.queue();
        expect(requests).toHaveLength(1);

        endFirst();
        await vi.waitFor(() => expect(requests).toHaveLength(2));
        const users = requests[1]!.messages.filter((m) => m.role === 'user').map((m) => m.content);
        expect(users.at(-1)).toBe('and a follow-up');
        expect(messages.filter((m) => m.role === 'user').map((m) => m.content)).toEqual(['first question', 'and a follow-up']);
        await vi.waitFor(() => expect(composer.streaming).toBe(false));
        expect(composer.queued).toEqual([]);
    });
});
