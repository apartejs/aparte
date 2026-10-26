// @vitest-environment jsdom
/**
 * What the model is sent once a conversation holds a checkpoint (`contextSummary`).
 *
 * The messages before the checkpoint are still in the transcript — compaction deletes
 * nothing — but the model reads the summary in their place. Every way a history is built
 * has to agree: the ordinary send, a retry, an edit and the resume of a paused turn. They
 * are asserted on the exact roles and contents that leave, because a checkpoint read by
 * three of the four is the failure that matters: the fourth sends the whole transcript,
 * and the window the summary freed fills again without a sign of it.
 */
import { describe, it, expect } from 'vitest';
import { AparteClient, type AparteClientOptions } from '../aparte-client.js';
import { AparteConfig } from '../../config/index.js';
import { AparteMessageRepository } from '../../runtime/message-repository.js';
import type { AparteChatMessage, AparteChatRequest } from '../../types/chat.js';
import type { AparteMessage } from '../../types/index.js';

const PREAMBLE = 'The earlier part of this conversation was compacted. This is a summary of what came before; continue from it.';
const SUMMARY = 'The user is planning a trip to Lisbon.';
const summarised = `${PREAMBLE}\n\n${SUMMARY}`;

const turn = (id: string, role: 'user' | 'assistant', extra: Partial<AparteMessage> = {}): AparteMessage => ({
    id, role, content: `${role === 'user' ? 'question' : 'answer'} ${id}`, timestamp: 1,
    ...(role === 'assistant' ? { status: 'completed' as const } : {}), ...extra,
});
const checkpoint = { contextSummary: { summary: SUMMARY, count: 2, createdAt: 10 } };
const pending = (id = 'p'): AparteMessage => turn(id, 'assistant', { content: '', status: 'pending' });

/** Two answered exchanges, the second one opening on a checkpoint: u1 a1 [u2] a2. */
const transcript = (): AparteMessage[] => [
    turn('u1', 'user'), turn('a1', 'assistant'),
    turn('u2', 'user', checkpoint), turn('a2', 'assistant'),
];

const textOf = (m: AparteChatMessage): string => (typeof m.content === 'string' ? m.content : JSON.stringify(m.content));
const wire = (messages: AparteChatMessage[]): Array<[string, string]> => messages.map((m) => [m.role, textOf(m)]);

type Internals = {
    _buildMessages(content: string, target: unknown): AparteChatMessage[];
    _resumeBase(all: AparteMessage[], replyIndex: number): AparteChatMessage[];
    _handleRetry(e: Event): Promise<void>;
    _handleEdit(e: Event): Promise<void>;
};

function setup(options: Partial<AparteClientOptions> = {}) {
    const cfg = new AparteConfig();
    cfg.registerAIProvider({
        id: 'mock', getMetadata: () => ({ id: 'mock', name: 'M' }),
        getModels: () => [{ id: 'm', name: 'M' }], chat: async () => '',
    } as never);
    cfg.setModelConfig({ defaultProvider: 'mock', defaultModel: 'm' });
    cfg.setKeyProvider(() => 'k');
    const seen: AparteChatRequest[] = [];
    cfg.setTransport({
        chat: (_p: unknown, request: AparteChatRequest) => {
            seen.push(request);
            return new ReadableStream({ start(c) { c.enqueue({ type: 'done' }); c.close(); } });
        },
    } as never);
    const make = (target?: HTMLElement) => new AparteClient({
        config: cfg, autoRegister: false, ...(target ? { targetResolver: () => target as never } : {}), ...options,
    }) as unknown as Internals;
    return { seen, make };
}

/**
 * A chat target backed by the real message tree, so edit and retry mutate it the way the
 * viewport does: a retry forks a sibling, an edit clears every child of the edited message.
 */
function treeTarget(messages: AparteMessage[]) {
    const repo = new AparteMessageRepository();
    let parent: string | null = null;
    for (const m of messages) { repo.addOrUpdateMessage(parent, m); parent = m.id; }
    const el = document.createElement('div');
    const api: Record<string, unknown> = {
        getMessages: () => repo.getMessages(),
        getMessage: (id: string) => repo.getMessageById(id),
        updateMessage: (id: string, u: Partial<AparteMessage>) => repo.updateMessage(id, u),
        appendMessage: (m: AparteMessage) => repo.addOrUpdateMessage(repo.headId, m),
        truncateResponsesAfter: (id: string) => repo.clearChildren(id),
        addSiblingOf: (id: string, m: AparteMessage) => {
            repo.addOrUpdateMessage(repo.getMessage(id)?.parentId ?? null, m);
            repo.switchToBranch(m.id);
            return m.id;
        },
    };
    for (const k of ['addSegment', 'updateSegment', 'typeName', 'setUsage', 'updateLastMessage']) api[k] = () => {};
    Object.assign(el, api);
    return { el, repo };
}

describe('send: the model reads the summary, then the messages from the checkpoint on', () => {
    it('sends summary, kept turns and the new question, the summary merged into the first user turn', () => {
        const { make } = setup();
        const path = [...transcript(), turn('u3', 'user'), pending()];
        const out = make()._buildMessages('new question', { getMessages: () => path });
        expect(wire(out)).toEqual([
            ['user', `${summarised}\n\nquestion u2`],
            ['assistant', 'answer a2'],
            ['user', 'new question'],
        ]);
    });

    it('sends the summary first when the checkpoint sits on the very message being sent', () => {
        // The shape a turn retried after an overflow has: the checkpoint was written onto
        // the user message that is still waiting for its answer.
        const { make } = setup();
        const path = [turn('u1', 'user'), turn('a1', 'assistant'), turn('u2', 'user', checkpoint), pending()];
        const out = make()._buildMessages('question u2', { getMessages: () => path });
        expect(wire(out)).toEqual([['user', `${summarised}\n\nquestion u2`]]);
    });

    it('drops a legacy compaction message before the checkpoint and keeps the summary once', () => {
        const { make } = setup();
        const legacy: AparteMessage = { id: 'old', role: 'user', content: 'OLD SUMMARY', compaction: true, timestamp: 1 };
        const path = [legacy, ...transcript(), turn('u3', 'user'), pending()];
        const out = wire(make()._buildMessages('go on', { getMessages: () => path }));
        expect(out.map(([, t]) => t).join('\n')).not.toContain('OLD SUMMARY');
        expect(out).toEqual([
            ['user', `${summarised}\n\nquestion u2`],
            ['assistant', 'answer a2'],
            ['user', 'go on'],
        ]);
    });

    it('still sends a legacy compaction message that comes after the checkpoint', () => {
        const { make } = setup();
        const legacy: AparteMessage = { id: 'later', role: 'user', content: 'LATER SUMMARY', compaction: true, timestamp: 1 };
        const path = [...transcript(), legacy, turn('u3', 'user'), turn('a3', 'assistant'), pending()];
        const out = wire(make()._buildMessages('go on', { getMessages: () => path }));
        expect(out[0]).toEqual(['user', `${summarised}\n\nquestion u2`]);
        expect(out[1]).toEqual(['assistant', 'answer a2']);
        expect(out[2]![1]).toBe(`${PREAMBLE}\n\nLATER SUMMARY\n\nquestion u3`);
    });

    it('sends the whole transcript when no message is a checkpoint', () => {
        const { make } = setup();
        const path = [turn('u1', 'user'), turn('a1', 'assistant'), pending()];
        expect(wire(make()._buildMessages('next', { getMessages: () => path }))).toEqual([
            ['user', 'question u1'], ['assistant', 'answer a1'], ['user', 'next'],
        ]);
    });

    it('hands a history function the full transcript, checkpoint and everything before it', () => {
        let received: AparteMessage[] = [];
        const { make } = setup({ history: (viewport) => { received = viewport; return []; } });
        make()._buildMessages('x', { getMessages: () => transcript() });
        expect(received.map((m) => m.id)).toEqual(['u1', 'a1', 'u2', 'a2']);
    });
});

describe('retry', () => {
    const retry = async (messages: AparteMessage[], messageId: string) => {
        const { seen, make } = setup();
        const { el } = treeTarget(messages);
        await make(el)._handleRetry(new CustomEvent('aparte-retry', { detail: { messageId } }));
        return wire(seen[0]!.messages);
    };

    it('regenerating the reply under the checkpoint sends the summary and the user turn', async () => {
        expect(await retry(transcript(), 'a2')).toEqual([['user', `${summarised}\n\nquestion u2`]]);
    });

    it('retrying the checkpoint message itself sends the summary in front of it', async () => {
        expect(await retry([...transcript(), turn('u3', 'user'), turn('a3', 'assistant')], 'u2'))
            .toEqual([['user', `${summarised}\n\nquestion u2`]]);
    });

    it('regenerating a reply ABOVE the checkpoint sends the full history up to it, no summary', async () => {
        // The new branch forks off before the checkpoint, so the checkpoint is not on it:
        // sending the summary would describe messages the model is also reading.
        expect(await retry(transcript(), 'a1')).toEqual([['user', 'question u1']]);
    });

    it('reads the checkpoint further down when the retried reply follows it', async () => {
        const path = [...transcript(), turn('u3', 'user'), turn('a3', 'assistant')];
        expect(await retry(path, 'a3')).toEqual([
            ['user', `${summarised}\n\nquestion u2`], ['assistant', 'answer a2'], ['user', 'question u3'],
        ]);
    });
});

describe('edit', () => {
    const edit = async (messages: AparteMessage[], messageId: string, content: string) => {
        const { seen, make } = setup();
        const target = treeTarget(messages);
        await make(target.el)._handleEdit(new CustomEvent('aparte-edit', { detail: { messageId, content } }));
        return { sent: wire(seen[0]!.messages), repo: target.repo };
    };

    it('editing the checkpoint message keeps the checkpoint: the summary still goes out first', async () => {
        const { sent, repo } = await edit(transcript(), 'u2', 'a reworded question');
        expect(sent).toEqual([['user', `${summarised}\n\na reworded question`]]);
        // The edit is a merge into the same node, so the field survives for the path.
        expect(repo.getMessageById('u2')!.contextSummary).toEqual(checkpoint.contextSummary);
    });

    it('editing ABOVE the checkpoint truncates it away and the full history goes out', async () => {
        const { sent, repo } = await edit(transcript(), 'u1', 'a reworded first question');
        // `truncateResponsesAfter` clears the edited message's children, the checkpoint
        // message and its reply included: from here the transcript is whole again, and the
        // gauge, not this path, decides whether it still fits.
        expect(sent).toEqual([['user', 'a reworded first question']]);
        expect(repo.getMessageById('u2')).toBeUndefined();
        expect(repo.getMessages().map((m) => m.id).slice(0, 1)).toEqual(['u1']);
    });
});

describe('resume of a paused turn', () => {
    it('rebuilds the request with the summary in front of the message that asked', () => {
        const { make } = setup();
        const all = [...transcript(), turn('u3', 'user'), pending('paused')];
        expect(wire(make()._resumeBase(all, all.length - 1))).toEqual([
            ['user', `${summarised}\n\nquestion u2`],
            ['assistant', 'answer a2'],
            ['user', 'question u3'],
        ]);
    });

    it('keeps the summary first when the checkpoint is on the message that asked', () => {
        const { make } = setup();
        const all = [turn('u1', 'user'), turn('a1', 'assistant'), turn('u2', 'user', checkpoint), pending('paused')];
        expect(wire(make()._resumeBase(all, all.length - 1))).toEqual([['user', `${summarised}\n\nquestion u2`]]);
    });

    it('ignores a legacy compaction message before the checkpoint', () => {
        const { make } = setup();
        const legacy: AparteMessage = { id: 'old', role: 'user', content: 'OLD SUMMARY', compaction: true, timestamp: 1 };
        const all = [legacy, ...transcript(), turn('u3', 'user'), pending('paused')];
        const out = wire(make()._resumeBase(all, all.length - 1));
        expect(out.map(([, t]) => t).join('\n')).not.toContain('OLD SUMMARY');
        expect(out[0]).toEqual(['user', `${summarised}\n\nquestion u2`]);
    });
});
