// @vitest-environment jsdom
/**
 * A history that starts at a checkpoint opens with the compaction summary, sent as a `user`
 * message under its preamble and joined to the person's next message when one follows (a
 * strict chat template refuses two user turns in a row). The model reads the preamble; a
 * server that keeps its own history cannot tell that text from what the person said.
 *
 * So the request names it, in `_meta.historySummary`: the text the first `user` message opens
 * with, exactly. The way the Claude and OpenAI APIs hand back a compaction, as a typed item
 * and not as text to recognise. Never on a request whose history holds no summary.
 */
import { describe, it, expect } from 'vitest';
import { AparteClient } from '../aparte-client.js';
import { AparteConfig } from '../../config/index.js';
import { AparteDirectTransport } from '../../transport/direct-transport.js';
import type { AparteChatMessage, AparteChatRequest, AparteMessage } from '../../types/index.js';

const PREAMBLE = 'The earlier part of this conversation was compacted. This is a summary of what came before; continue from it.';
const SUMMARY = 'The user is planning a trip to Lisbon.\n\nThey fly on Friday.';
const summarised = `${PREAMBLE}\n\n${SUMMARY}`;

const turn = (id: string, role: 'user' | 'assistant', extra: Partial<AparteMessage> = {}): AparteMessage => ({
    id, role, content: `${role === 'user' ? 'question' : 'answer'} ${id}`, timestamp: 1,
    ...(role === 'assistant' ? { status: 'completed' as const } : {}), ...extra,
});
/** u1 a1 [u2] a2: the second exchange opens on a checkpoint. */
const transcript = (): AparteMessage[] => [
    turn('u1', 'user'), turn('a1', 'assistant'),
    turn('u2', 'user', { contextSummary: { summary: SUMMARY, count: 2, createdAt: 10 } }), turn('a2', 'assistant'),
];

function harness(messages: AparteMessage[]) {
    const seen: AparteChatRequest[] = [];
    const cfg = new AparteConfig();
    cfg.registerAIProvider({
        id: 'p',
        getMetadata: () => ({ id: 'p', name: 'P' }),
        getModels: () => [{ id: 'm', name: 'M' }],
        chat: async (request: AparteChatRequest) => { seen.push(request); return ''; },
    } as never);
    cfg.setModelConfig({ defaultProvider: 'p', defaultModel: 'm' });
    cfg.setKeyProvider(() => '');
    cfg.setTransport(new AparteDirectTransport({ byok: true }));
    const el = document.createElement('div') as unknown as Record<string, unknown>;
    for (const m of ['addSegment', 'updateSegment', 'typeName', 'setUsage', 'updateLastMessage', 'appendToken', 'completeMessage', 'truncateResponsesAfter']) el[m] = () => {};
    el['getMessages'] = () => messages;
    el['appendMessage'] = (message: AparteMessage) => { messages.push(message); };
    el['updateMessage'] = (id: string, patch: Partial<AparteMessage>) => { Object.assign(messages.find((m) => m.id === id) ?? {}, patch); };
    const client = new AparteClient({ config: cfg, autoRegister: false, targetResolver: () => el as never }) as unknown as {
        _handleSend: (e: Event) => Promise<void>;
        _handleEdit: (e: CustomEvent) => Promise<void>;
    };
    return {
        seen,
        send: (detail: object) => client._handleSend(new CustomEvent('aparte-send', { detail })),
        edit: (detail: object) => client._handleEdit(new CustomEvent('aparte-edit', { detail })),
    };
}

const firstUser = (request: AparteChatRequest): string => {
    const content = request.messages.find((m) => m.role === 'user')!.content as AparteChatMessage['content'];
    return typeof content === 'string' ? content : content.map((p) => (p.type === 'text' ? p.text : '')).join('');
};

describe("a request whose history opens with a compaction summary", () => {
    it('names the summary, exactly as the first user message opens with it', async () => {
        const { seen, send } = harness(transcript());
        await send({ content: 'new question' });
        const request = seen[0]!;
        expect(request._meta?.historySummary).toBe(summarised);
        // What follows the summary, after a blank line, is the person's.
        expect(firstUser(request)).toBe(`${summarised}\n\nquestion u2`);
        expect(firstUser(request).startsWith(request._meta!.historySummary!)).toBe(true);
    });

    it('names it on an edit too, the summary being the same', async () => {
        const { seen, edit } = harness([...transcript(), turn('u3', 'user'), turn('a3', 'assistant')]);
        await edit({ messageId: 'u3', content: 'reworded' });
        expect(seen[0]!._meta?.historySummary).toBe(summarised);
    });

    it('carries it beside what the message sent puts in `_meta`', async () => {
        const tokens = [{ label: 'Paul', text: '@paul', start: 0, end: 5, data: { id: 1 } }];
        const { seen, send } = harness(transcript());
        await send({ content: '@paul hi', tokens });
        expect(seen[0]!._meta).toEqual({ tokens, historySummary: summarised });
    });

    it('is absent from a request whose history holds no summary', async () => {
        const { seen, send } = harness([turn('u1', 'user'), turn('a1', 'assistant')]);
        await send({ content: 'next' });
        expect(seen[0]!).not.toHaveProperty('_meta');
    });
});
