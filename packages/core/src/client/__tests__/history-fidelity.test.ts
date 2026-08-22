import { describe, it, expect } from 'vitest';
import { AparteClient } from '../aparte-client.js';
import { AparteConfig } from '../../config/index.js';
import type { AparteChatRequest } from '../../types/chat.js';
import type { AparteMessage } from '../../types/index.js';

/**
 * What the model is told the assistant said last turn.
 *
 * A reply that OPENS with a code fence used to be sent back as the three
 * backticks and nothing else. Three correct-in-isolation decisions composed into
 * it: the parser withholds an ambiguous prefix without creating an active segment
 * (`aparte-stream-parser.ts`), so the loop concludes "the parser produced nothing"
 * and writes the raw delta into `message.content`, and `_extractText` preferred
 * `content` over `segments`.
 *
 * It is invisible in the UI — the bubble hides its content element as soon as
 * segments exist — so no playground, no browser test and no unit test could see
 * it. Only what leaves for the next turn shows it.
 */
function harness(messages: AparteMessage[]) {
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
            return new ReadableStream({
                start(c) { c.enqueue({ type: 'done' }); c.close(); },
            });
        },
    } as never);

    const el = document.createElement('div');
    for (const m of ['updateMessage', 'addSegment', 'updateSegment', 'typeName', 'setUsage', 'updateLastMessage', 'appendMessage']) {
        (el as unknown as Record<string, unknown>)[m] = () => {};
    }
    (el as unknown as Record<string, unknown>).getMessages = () => messages;
    return { cfg, el, seen };
}

/** The state the viewport really holds after a fence-opening reply. */
const fenceOpeningReply = (raw: string, rendered: AparteMessage['segments']): AparteMessage[] => [
    { id: 'u1', role: 'user', content: 'show me a snippet', timestamp: 1 },
    { id: 'a1', role: 'assistant', content: raw, segments: rendered, timestamp: 2, status: 'completed' },
];

const historyOf = (seen: AparteChatRequest[]): string => {
    const assistant = seen[0]?.messages?.filter(m => m.role === 'assistant') ?? [];
    return assistant.map(m => (typeof m.content === 'string' ? m.content : JSON.stringify(m.content))).join('|');
};

describe('history reconstruction prefers what was RENDERED', () => {
    for (const [label, raw] of [
        ['a code fence', '```'],
        ['an inline-code backtick', '`'],
        ['a thinking tag', '<'],
    ] as const) {
        it(`a reply opening with ${label} is not reduced to "${raw}"`, async () => {
            const { cfg, el, seen } = harness(fenceOpeningReply(raw, [
                { id: 's1', type: 'code', language: 'py', content: 'print(1)' } as never,
            ]));
            const client = new AparteClient({ config: cfg, autoRegister: false, targetResolver: () => el as never });
            await (client as unknown as { _handleSend: (e: Event) => Promise<void> })._handleSend(
                new CustomEvent('aparte-send', { detail: { content: 'and now explain it' } }),
            );
            const history = historyOf(seen);
            expect(history, `the whole assistant turn was "${raw}"`).not.toBe(raw);
            expect(history, 'the rendered code must reach the model').toContain('print(1)');
        });
    }

    it('keeps the fence and the language, so code does not read as prose', async () => {
        const { cfg, el, seen } = harness(fenceOpeningReply('', [
            { id: 's1', type: 'text', content: 'Here:' } as never,
            { id: 's2', type: 'code', language: 'py', content: 'print(1)' } as never,
        ]));
        const client = new AparteClient({ config: cfg, autoRegister: false, targetResolver: () => el as never });
        await (client as unknown as { _handleSend: (e: Event) => Promise<void> })._handleSend(
            new CustomEvent('aparte-send', { detail: { content: 'again' } }),
        );
        const history = historyOf(seen);
        expect(history, 'a fence tells the model this is code').toContain('```');
        expect(history, 'and which language it is').toContain('py');
    });

    it('does not drop an artifact the model produced', async () => {
        const { cfg, el, seen } = harness(fenceOpeningReply('', [
            { id: 's1', type: 'text', content: 'Built it:' } as never,
            { id: 's2', type: 'artifact', title: 'Page', artifactType: 'html', content: '<h1>Hi</h1>' } as never,
        ]));
        const client = new AparteClient({ config: cfg, autoRegister: false, targetResolver: () => el as never });
        await (client as unknown as { _handleSend: (e: Event) => Promise<void> })._handleSend(
            new CustomEvent('aparte-send', { detail: { content: 'change the title' } }),
        );
        expect(historyOf(seen), 'the artifact is invisible next turn').toContain('Page');
    });

    it('still falls back to `content` when there are no segments', async () => {
        // A non-streaming transport writes the whole reply to `content` and creates
        // no segments, so the fallback has to stay.
        const { cfg, el, seen } = harness([
            { id: 'u1', role: 'user', content: 'hi', timestamp: 1 },
            { id: 'a1', role: 'assistant', content: 'plain reply', timestamp: 2, status: 'completed' },
        ]);
        const client = new AparteClient({ config: cfg, autoRegister: false, targetResolver: () => el as never });
        await (client as unknown as { _handleSend: (e: Event) => Promise<void> })._handleSend(
            new CustomEvent('aparte-send', { detail: { content: 'more' } }),
        );
        expect(historyOf(seen)).toContain('plain reply');
    });
});
