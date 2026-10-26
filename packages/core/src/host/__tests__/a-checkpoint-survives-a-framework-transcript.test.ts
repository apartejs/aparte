// @vitest-environment jsdom
/**
 * A checkpoint (`contextSummary`) under a framework: the model still reads the summary
 * after a retry and after an edit, and the message that carries it still carries it.
 *
 * Under a wrapper the transcript is the framework's own list and the viewport's tree is
 * a copy, rebuilt from that list before a branch operation (`syncRepoFromMessages`). The
 * checkpoint travels from the one to the other only through that sync's generic field
 * copy, so a field added to the tree-owned set, or a path merge that rebuilt messages
 * without it, would drop the checkpoint with nothing in the suite to say so — and the
 * next request would send the whole transcript the summary was written to replace. The
 * client's own tests drive a fake tree; this one drives the real viewport and host.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AparteChatHost, type AparteChatHostBinding } from '../aparte-chat-host.js';
import { AparteClient } from '../../client/aparte-client.js';
import { AparteConfig } from '../../config/aparte-config.js';
import '../../components/viewport/aparte-chat-viewport.js';
import type { AparteChatMessage, AparteChatRequest } from '../../types/chat.js';
import type { AparteMessage } from '../../types/index.js';

const PREAMBLE = 'The earlier part of this conversation was compacted. This is a summary of what came before; continue from it.';
const SUMMARY = 'The user is planning a trip to Lisbon.';
const summarised = `${PREAMBLE}\n\n${SUMMARY}`;
const contextSummary = { summary: SUMMARY, count: 2, createdAt: 10 };

const turn = (id: string, role: 'user' | 'assistant', extra: Partial<AparteMessage> = {}): AparteMessage => ({
    id, role, content: `${role === 'user' ? 'question' : 'answer'} ${id}`, timestamp: 1,
    ...(role === 'assistant' ? { status: 'completed' as const } : {}), ...extra,
});

/** u1 a1 u2 a2 u3 a3 — the checkpoint is written onto u2 afterwards, the way a compaction writes it. */
const transcript = (): AparteMessage[] => [
    turn('u1', 'user'), turn('a1', 'assistant'),
    turn('u2', 'user'), turn('a2', 'assistant'),
    turn('u3', 'user'), turn('a3', 'assistant'),
];

const textOf = (m: AparteChatMessage): string => (typeof m.content === 'string' ? m.content : JSON.stringify(m.content));
const wire = (request: AparteChatRequest): Array<[string, string]> =>
    request.messages.filter((m) => m.role !== 'system').map((m) => [m.role, textOf(m)]);

type Internals = {
    _handleRetry(e: Event): Promise<void>;
    _handleEdit(e: Event): Promise<void>;
};

async function setup() {
    const config = new AparteConfig();
    config.registerAIProvider({
        id: 'mock', getMetadata: () => ({ id: 'mock', name: 'M' }),
        getModels: () => [{ id: 'm', name: 'M' }], chat: async () => '',
    } as never);
    config.setModelConfig({ defaultProvider: 'mock', defaultModel: 'm' });
    config.setKeyProvider(() => 'k');
    const seen: AparteChatRequest[] = [];
    config.setTransport({
        chat: (_p: unknown, request: AparteChatRequest) => {
            seen.push(request);
            return new ReadableStream({ start(c) { c.enqueue({ type: 'done' }); c.close(); } });
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
    // Through the host, as the plugin's write is: the framework's list takes it at once and
    // the viewport's tree hears of it only when the next branch operation syncs the list in.
    host.updateMessage('u2', { contextSummary });

    const client = new AparteClient({
        config, autoRegister: false, targetResolver: () => root,
    }) as unknown as Internals;
    const summaryOf = (id: string) => messages.find((m) => m.id === id)?.contextSummary;
    const treeSummaryOf = (id: string) =>
        (viewport as unknown as { getMessage(id: string): AparteMessage | undefined }).getMessage(id)?.contextSummary;
    // What a save does before it serialises the tree: bring the framework's list into it.
    const treeAfterSync = (id: string) => { host.syncRepoFromMessages(); return treeSummaryOf(id); };
    return { client, seen, teardown, summaryOf, treeSummaryOf, treeAfterSync };
}

describe('a checkpoint on a transcript the framework owns', () => {
    beforeEach(() => { document.body.innerHTML = ''; });
    afterEach(() => { document.body.innerHTML = ''; });

    it('is read by a retry, and the checkpoint message keeps it in the list and in the tree', async () => {
        const { client, seen, teardown, summaryOf, treeSummaryOf } = await setup();
        expect(summaryOf('u2'), 'written on the list').toEqual(contextSummary);
        expect(treeSummaryOf('u2'), 'not in the tree until a sync').toBeUndefined();

        await client._handleRetry(new CustomEvent('aparte-retry', { detail: { messageId: 'a3' } }));

        expect(wire(seen[0]!)).toEqual([
            ['user', `${summarised}\n\nquestion u2`],
            ['assistant', 'answer a2'],
            ['user', 'question u3'],
        ]);
        // The retry forked a sibling of a3, which synced the list into the tree first: the
        // generic field copy is the only road the checkpoint takes into the tree.
        expect(summaryOf('u2'), 'still on the list after the fork').toEqual(contextSummary);
        expect(treeSummaryOf('u2'), 'carried into the tree by the sync').toEqual(contextSummary);
        teardown();
    });

    it('is read by an edit of the checkpoint message, which keeps the checkpoint', async () => {
        const { client, seen, teardown, summaryOf, treeAfterSync } = await setup();

        await client._handleEdit(new CustomEvent('aparte-edit', {
            detail: { messageId: 'u2', content: 'a reworded question' },
        }));

        expect(wire(seen[0]!)).toEqual([['user', `${summarised}\n\na reworded question`]]);
        // An edit merges into the same node, so what the summary stands for is unchanged.
        expect(summaryOf('u2'), 'still on the list after the edit').toEqual(contextSummary);
        expect(treeAfterSync('u2'), 'in the tree once the list is synced after the edit').toEqual(contextSummary);
        teardown();
    });

    it('is read by a retry and then an edit in a row', async () => {
        const { client, seen, teardown, summaryOf, treeAfterSync } = await setup();

        await client._handleRetry(new CustomEvent('aparte-retry', { detail: { messageId: 'a3' } }));
        await client._handleEdit(new CustomEvent('aparte-edit', {
            detail: { messageId: 'u2', content: 'a reworded question' },
        }));

        expect(wire(seen[1]!)).toEqual([['user', `${summarised}\n\na reworded question`]]);
        expect(summaryOf('u2')).toEqual(contextSummary);
        expect(treeAfterSync('u2')).toEqual(contextSummary);
        teardown();
    });
});
