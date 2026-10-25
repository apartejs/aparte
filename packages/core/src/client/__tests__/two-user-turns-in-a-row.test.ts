import { describe, it, expect } from 'vitest';
import { AparteClient } from '../aparte-client.js';
import { mergeAdjacentUserMessages } from '../wire-history.js';
import { AparteConfig } from '../../config/aparte-config.js';
import type { AparteChatMessage, AparteChatRequest } from '../../types/chat.js';
import type { AparteMessage } from '../../types/index.js';

/**
 * The model must never receive two `user` messages in a row.
 *
 * Strict chat templates (Gemma, Mistral, llama.cpp `--jinja`, vLLM) reject roles that do
 * not alternate, and one such history fails every turn after it. Two ordinary cases build
 * it: a compaction summary (a `user` message) in front of the kept turns, which start with
 * one, and a failed turn whose error reply is not sent when the user writes again.
 */
const sendFrom = (messages: AparteMessage[], content: string): AparteChatMessage[] => {
    const client = new AparteClient({ config: new AparteConfig(), autoRegister: false });
    const target = { getMessages: () => messages };
    return (client as unknown as {
        _buildMessages(c: string, t: unknown): AparteChatMessage[];
    })._buildMessages(content, target);
};

describe('the history sent alternates its roles', () => {
    it('a compaction summary, a kept user turn and a new message alternate', () => {
        const out = sendFrom([
            { id: 's', role: 'user', content: 'Summary of the talk so far.', compaction: true, timestamp: 1 },
            { id: 'u1', role: 'user', content: 'kept question', timestamp: 2 },
            { id: 'a1', role: 'assistant', content: 'kept answer', timestamp: 3, status: 'completed' },
        ], 'new question');
        expect(out.map((m) => m.role)).toEqual(['user', 'assistant', 'user']);
        expect(out[0]!.content).toContain('Summary of the talk so far.');
        expect(out[0]!.content).toContain('kept question');
        expect(out[2]!.content).toBe('new question');
    });

    it('an errored turn followed by a new message is one user message carrying both texts', async () => {
        // The send path cuts at the last ANSWERED reply, so it never sees the failed turn;
        // an edit keeps everything up to the edited message, and there the failed turn's
        // user message sits right beside the one being reworded.
        const seen: AparteChatRequest[] = [];
        const cfg = new AparteConfig();
        cfg.registerAIProvider({
            id: 'mock', getMetadata: () => ({ id: 'mock', name: 'M' }),
            getModels: () => [{ id: 'm', name: 'M' }], chat: async () => '',
        } as never);
        cfg.setModelConfig({ defaultProvider: 'mock', defaultModel: 'm' });
        cfg.setKeyProvider(() => 'k');
        cfg.setTransport({
            chat: (_p: unknown, request: AparteChatRequest) => {
                seen.push(request);
                return new ReadableStream({ start(c) { c.enqueue({ type: 'done' }); c.close(); } });
            },
        } as never);
        const messages: AparteMessage[] = [
            { id: 'u1', role: 'user', content: 'first try', timestamp: 1 },
            { id: 'a1', role: 'assistant', content: '', timestamp: 2, status: 'error' },
            { id: 'u2', role: 'user', content: 'second try', timestamp: 3 },
        ];
        const el = document.createElement('div');
        for (const m of ['updateMessage', 'addSegment', 'updateSegment', 'typeName', 'setUsage', 'updateLastMessage', 'appendMessage', 'truncateResponsesAfter']) {
            (el as unknown as Record<string, unknown>)[m] = () => {};
        }
        (el as unknown as Record<string, unknown>).getMessages = () => messages;
        const client = new AparteClient({ config: cfg, autoRegister: false, targetResolver: () => el as never });
        await (client as unknown as { _handleEdit: (e: Event) => Promise<void> })._handleEdit(
            new CustomEvent('aparte-edit', { detail: { messageId: 'u2', content: 'second try' } }),
        );
        const sent = seen[0]!.messages;
        expect(sent.map((m) => m.role)).toEqual(['user']);
        expect(sent[0]!.content).toBe('first try\n\nsecond try');
    });
});

describe('mergeAdjacentUserMessages', () => {
    it('leaves an alternating history as it is', () => {
        const history: AparteChatMessage[] = [
            { role: 'system', content: 's' },
            { role: 'user', content: 'a' },
            { role: 'assistant', content: 'b' },
            { role: 'user', content: 'c' },
        ];
        expect(mergeAdjacentUserMessages(history)).toEqual(history);
    });

    it('never merges system or assistant messages', () => {
        const history: AparteChatMessage[] = [
            { role: 'system', content: 's1' }, { role: 'system', content: 's2' },
            { role: 'assistant', content: 'a1' }, { role: 'assistant', content: 'a2' },
        ];
        expect(mergeAdjacentUserMessages(history)).toEqual(history);
    });

    it('keeps an image part through a merge, a string beside parts becoming a text part', () => {
        const image = { type: 'image' as const, image: 'data:image/png;base64,AAAA' };
        const merged = mergeAdjacentUserMessages([
            { role: 'user', content: 'look' },
            { role: 'user', content: [{ type: 'text', text: 'at this' }, image] },
        ]);
        expect(merged).toHaveLength(1);
        const parts = merged[0]!.content as Array<{ type: string; text?: string }>;
        expect(parts.map((p) => p.type)).toEqual(['text', 'text', 'text', 'image']);
        expect(parts[0]!.text).toBe('look');
        expect(parts).toContain(image);
    });
});
