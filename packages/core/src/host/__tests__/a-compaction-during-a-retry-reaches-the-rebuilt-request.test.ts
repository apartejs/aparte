// @vitest-environment jsdom
/**
 * A retry or an edit under a framework builds its request again when the compactor wrote a
 * checkpoint while the turn waited, and the rebuilt request must carry that checkpoint.
 *
 * The client resolves the framework's `[data-aparte-chat]` root as its target, and the
 * root offered no `getMessage`: every message of the slice fell back to the snapshot the
 * retry took before it streamed, which never holds a summary the compactor wrote a moment
 * later. The request therefore went out whole, and an overflow's second attempt sent the
 * same oversized request again. The vanilla viewport has `getMessage`, which is why the
 * client's own tests, run on it, never saw this.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AparteChatHost, type AparteChatHostBinding } from '../aparte-chat-host.js';
import { AparteClient } from '../../client/aparte-client.js';
import { AparteConfig } from '../../config/aparte-config.js';
import { AparteError, AparteErrorCode } from '../../types/errors.js';
import type { AparteCompactor, AparteCompactorOutcome } from '../../types/compactor.js';
import '../../components/viewport/aparte-chat-viewport.js';
import type { AparteChatRequest } from '../../types/chat.js';
import type { AparteMessage, AparteStreamEvent } from '../../types/index.js';

const SUMMARY = 'The user is planning a trip to Lisbon.';
const contextSummary = { summary: SUMMARY, count: 2, createdAt: 10 };
const COMPACTED: AparteCompactorOutcome = { ok: true, skipped: false, summary: SUMMARY, kept: 2, dropped: 2 };

const turn = (id: string, role: 'user' | 'assistant'): AparteMessage => ({
    id, role, content: `${role === 'user' ? 'question' : 'answer'} ${id}`, timestamp: 1,
    ...(role === 'assistant' ? { status: 'completed' as const } : {}),
});
const transcript = (): AparteMessage[] => [
    turn('u1', 'user'), turn('a1', 'assistant'),
    turn('u2', 'user'), turn('a2', 'assistant'),
    turn('u3', 'user'), turn('a3', 'assistant'),
];
const sentText = (request: AparteChatRequest): string =>
    request.messages.map((m) => (typeof m.content === 'string' ? m.content : JSON.stringify(m.content))).join('\n');

type Internals = {
    _handleRetry(e: Event): Promise<void>;
    _handleEdit(e: Event): Promise<void>;
};

async function setup(steps: Array<AparteStreamEvent[] | Error>, over: (write: () => void) => Partial<AparteCompactor>) {
    const config = new AparteConfig();
    config.registerAIProvider({
        id: 'mock', getMetadata: () => ({ id: 'mock', name: 'M' }),
        getModels: () => [{ id: 'm', name: 'M' }], chat: async () => '',
    } as never);
    config.setModelConfig({ defaultProvider: 'mock', defaultModel: 'm' });
    config.setKeyProvider(() => 'k');
    const seen: AparteChatRequest[] = [];
    config.setTransport({
        chat: async (_p: unknown, request: AparteChatRequest) => {
            seen.push(request);
            const step = steps[Math.min(seen.length - 1, steps.length - 1)]!;
            if (step instanceof Error) throw step;
            return new ReadableStream({ start(c) { for (const e of step) c.enqueue(e); c.close(); } });
        },
    } as never);

    const root = document.createElement('div');
    root.setAttribute('data-aparte-chat', '');
    root.id = 'h1';
    const viewport = document.createElement('aparte-chat-viewport');
    viewport.setAttribute('framework-managed', '');
    root.appendChild(viewport);
    document.body.appendChild(root);
    await vi.waitFor(() => expect(typeof (viewport as unknown as { exportTree?: unknown }).exportTree).toBe('function'));

    let messages: AparteMessage[] = [];
    const binding: AparteChatHostBinding = {
        hostId: 'h1', host: root, viewport,
        getMessages: () => messages,
        setMessages: (m) => { messages = m; },
        afterRender: (cb) => cb(),
    };
    const host = new AparteChatHost(binding, { config });
    const teardown = host.bind();
    for (const m of transcript()) host.appendMessage(m);

    // What the plugin does: through the host, onto the list the framework owns.
    const write = (): void => host.updateMessage('u2', { contextSummary });
    config.setCompactor({
        compact: vi.fn(async () => { write(); return COMPACTED; }),
        settled: async () => {},
        beforeSend: vi.fn(async () => false),
        ...over(write),
    });
    const client = new AparteClient({ config, autoRegister: false, targetResolver: () => root }) as unknown as Internals;
    return { client, seen, teardown, root };
}

const OK: AparteStreamEvent[] = [{ type: 'text', delta: 'Done.' } as AparteStreamEvent, { type: 'done' } as AparteStreamEvent];
const overflow = (): AparteError =>
    new AparteError('maximum context length exceeded', AparteErrorCode.USAGE_CONTEXT_EXCEEDED, undefined, undefined, 400);

describe('a compaction that lands while a retry or an edit waits, under a framework', () => {
    beforeEach(() => { document.body.innerHTML = ''; });
    afterEach(() => { document.body.innerHTML = ''; });

    it('lets the framework root read one message, as the viewport does', async () => {
        const { root, teardown } = await setup([OK], () => ({}));
        const getMessage = (root as unknown as { getMessage?(id: string): AparteMessage | undefined }).getMessage;
        expect(typeof getMessage).toBe('function');
        expect(getMessage!('u2')?.content).toBe('question u2');
        expect(getMessage!('nope')).toBeUndefined();
        teardown();
    });

    it('a retry sends the checkpoint the compactor wrote before the send', async () => {
        const { client, seen, teardown } = await setup([OK], (write) => ({
            beforeSend: vi.fn(async () => { write(); return true; }),
        }));
        await client._handleRetry(new CustomEvent('aparte-retry', { detail: { messageId: 'a3' } }));

        const sent = sentText(seen[0]!);
        expect(sent).toContain(SUMMARY);
        expect(sent, 'what the summary stands for is not sent').not.toContain('question u1');
        teardown();
    });

    it('an edit sends the checkpoint the compactor wrote before the send', async () => {
        const { client, seen, teardown } = await setup([OK], (write) => ({
            beforeSend: vi.fn(async () => { write(); return true; }),
        }));
        await client._handleEdit(new CustomEvent('aparte-edit', { detail: { messageId: 'u3', content: 'a reworded question' } }));

        const sent = sentText(seen[0]!);
        expect(sent).toContain(SUMMARY);
        expect(sent).toContain('a reworded question');
        expect(sent).not.toContain('question u1');
        teardown();
    });

    it('a retry that overflows sends a smaller request the second time, not the same one', async () => {
        const { client, seen, teardown } = await setup([overflow(), OK], () => ({}));
        await client._handleRetry(new CustomEvent('aparte-retry', { detail: { messageId: 'a3' } }));

        expect(seen).toHaveLength(2);
        expect(sentText(seen[0]!)).toContain('question u1');
        expect(sentText(seen[1]!)).toContain(SUMMARY);
        expect(sentText(seen[1]!)).not.toContain('question u1');
        teardown();
    });
});
