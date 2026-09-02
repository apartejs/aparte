import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
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
 * segments exist — so no example, no browser test and no unit test could see
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

    it('does not drop a segment of a type it does not know, when it carries content', async () => {
        // A registered block grammar (an artifact, a citation, a file) builds a type
        // core has no branch for. Dropping it made a document the model had just
        // produced invisible on the very next turn, so it could not be asked to
        // change the thing it had built — hence the generic rule: content, else
        // fallback, else nothing.
        const { cfg, el, seen } = harness(fenceOpeningReply('', [
            { id: 's1', type: 'text', content: 'Built it:' } as never,
            { id: 's2', type: 'artifact', title: 'Page', artifactType: 'html', content: '<h1>Hi</h1>' } as never,
            { id: 's3', type: 'custom', subType: 'chart', fallback: '[chart: sales by month]' } as never,
        ]));
        const client = new AparteClient({ config: cfg, autoRegister: false, targetResolver: () => el as never });
        await (client as unknown as { _handleSend: (e: Event) => Promise<void> })._handleSend(
            new CustomEvent('aparte-send', { detail: { content: 'change the title' } }),
        );
        const history = historyOf(seen);
        expect(history, 'the document is invisible next turn').toContain('<h1>Hi</h1>');
        expect(history, 'a segment with only a fallback still says what it was').toContain('[chart: sales by month]');
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

/**
 * `status` is optional on `AparteMessage`, and a host that seeds a transcript —
 * restoring a saved conversation, rendering a server-side one — has no reason to
 * invent one: the turns are over. `_toHistoryMessages` required
 * `status === 'completed'`, so the cutoff never advanced and the whole transcript
 * was sliced away: the model received the new question with no context at all, and
 * nothing in the UI said so.
 */
describe('history: viewport — a status-less transcript is history too', () => {
    const rolesOf = (seen: AparteChatRequest[]): string[] =>
        (seen[0]?.messages ?? [])
            .filter(m => m.role === 'user' || m.role === 'assistant')
            .map(m => m.role);

    const textOf = (seen: AparteChatRequest[]): string =>
        (seen[0]?.messages ?? [])
            .map(m => (typeof m.content === 'string' ? m.content : JSON.stringify(m.content)))
            .join('|');

    const send = async (messages: AparteMessage[], content: string) => {
        const { cfg, el, seen } = harness(messages);
        const client = new AparteClient({ config: cfg, autoRegister: false, targetResolver: () => el as never });
        await (client as unknown as { _handleSend: (e: Event) => Promise<void> })._handleSend(
            new CustomEvent('aparte-send', { detail: { content } }),
        );
        return seen;
    };

    it('sends a transcript the host seeded with no status at all', async () => {
        const seen = await send([
            { id: 'u1', role: 'user', content: 'what is a monad', timestamp: 1 },
            { id: 'a1', role: 'assistant', content: 'a monoid in the category of endofunctors', timestamp: 2 },
        ], 'now explain that');

        expect(rolesOf(seen), 'the seeded pair was sliced away and only the new question left').toEqual(
            ['user', 'assistant', 'user'],
        );
        expect(textOf(seen)).toContain('a monoid in the category of endofunctors');
    });

    it('still drops the trailing user echo, so the new question is not sent twice', async () => {
        // The composer has already appended the outgoing user row to the viewport by
        // the time the turn is built, so the cutoff must stop at the last answered
        // assistant — relaxing the gate must not relax that.
        const seen = await send([
            { id: 'u1', role: 'user', content: 'first', timestamp: 1 },
            { id: 'a1', role: 'assistant', content: 'answer', timestamp: 2 },
            { id: 'u2', role: 'user', content: 'now explain that', timestamp: 3 },
        ], 'now explain that');

        expect(rolesOf(seen)).toEqual(['user', 'assistant', 'user']);
        expect(
            textOf(seen).split('now explain that').length - 1,
            'the outgoing question must appear once, not twice',
        ).toBe(1);
    });

    it('does not send a turn that is still in flight', async () => {
        // A status-less assistant is answered; a `streaming` or `pending` one is not,
        // and its half-written text must not be presented as what it said.
        const seen = await send([
            { id: 'u1', role: 'user', content: 'first', timestamp: 1 },
            { id: 'a1', role: 'assistant', content: 'answer', timestamp: 2, status: 'completed' },
            { id: 'u2', role: 'user', content: 'second', timestamp: 3 },
            { id: 'a2', role: 'assistant', content: 'half a th', timestamp: 4, status: 'streaming' },
        ], 'third');

        expect(rolesOf(seen)).toEqual(['user', 'assistant', 'user']);
        expect(textOf(seen), 'a half-written reply is not what the assistant said').not.toContain('half a th');
    });

    it('does not send an errored turn, and does not let it advance the cutoff', async () => {
        const seen = await send([
            { id: 'u1', role: 'user', content: 'first', timestamp: 1 },
            { id: 'a1', role: 'assistant', content: '', timestamp: 2, status: 'error' },
        ], 'retry please');

        expect(rolesOf(seen), 'an error segment is not a reply').toEqual(['user']);
    });
});

/**
 * Send, retry and edit all answer the same question — "what did this conversation
 * say so far?" — and they answered it with two different pieces of code. Send went
 * through `_toHistoryMessages`, which drops errored turns and anything whose wire
 * text is empty; retry and edit went through `_messagesToChatMessages`, which kept
 * every user and assistant row whatever its status.
 *
 * So a turn that failed, or one stopped before its first token, reached the model
 * as `{ role: 'assistant', content: '' }` — a claim that the assistant said nothing,
 * which some providers reject outright and the rest read as an empty reply worth
 * imitating. The rule lives in one place now.
 */
describe('send, retry and edit agree about what history is', () => {
    const assistantsOf = (seen: AparteChatRequest[]) =>
        (seen[0]?.messages ?? []).filter(m => m.role === 'assistant');

    const rolesOf = (seen: AparteChatRequest[]): string[] =>
        (seen[0]?.messages ?? [])
            .filter(m => m.role === 'user' || m.role === 'assistant')
            .map(m => m.role);

    /** A failed turn and a turn stopped before its first token, both of them empty. */
    const transcript = (): AparteMessage[] => [
        { id: 'u1', role: 'user', content: 'first', timestamp: 1 },
        { id: 'a1', role: 'assistant', content: 'answer one', timestamp: 2, status: 'completed' },
        { id: 'u2', role: 'user', content: 'second', timestamp: 3 },
        { id: 'a2', role: 'assistant', content: '', timestamp: 4, status: 'error' },
        { id: 'u3', role: 'user', content: 'third', timestamp: 5 },
        { id: 'a3', role: 'assistant', content: '', segments: [], timestamp: 6, status: 'completed' },
    ];

    const clientFor = (messages: AparteMessage[]) => {
        const { cfg, el, seen } = harness(messages);
        (el as unknown as Record<string, unknown>).truncateResponsesAfter = () => {};
        (el as unknown as Record<string, unknown>).addSiblingOf = () => 'new';
        const client = new AparteClient({ config: cfg, autoRegister: false, targetResolver: () => el as never });
        return { client, seen };
    };

    it('retry puts no empty assistant turn on the wire', async () => {
        const { client, seen } = clientFor(transcript());
        await (client as unknown as { _handleRetry: (e: Event) => Promise<void> })._handleRetry(
            new CustomEvent('aparte-retry', { detail: { messageId: 'u3' } }),
        );

        expect(
            assistantsOf(seen).filter(m => m.content === ''),
            'a failed turn is not the assistant saying nothing',
        ).toEqual([]);
        expect(rolesOf(seen)).toEqual(['user', 'assistant', 'user', 'user']);
    });

    it('edit puts no empty assistant turn on the wire either', async () => {
        const { client, seen } = clientFor(transcript());
        await (client as unknown as { _handleEdit: (e: Event) => Promise<void> })._handleEdit(
            new CustomEvent('aparte-edit', { detail: { messageId: 'u3', content: 'third, reworded' } }),
        );

        expect(assistantsOf(seen).filter(m => m.content === '')).toEqual([]);
        expect(rolesOf(seen)).toEqual(['user', 'assistant', 'user', 'user']);
    });

    it('the two mappers return the same history for the same slice', async () => {
        const { client } = clientFor([]);
        const slice: AparteMessage[] = [
            { id: 'u1', role: 'user', content: 'first', timestamp: 1 },
            { id: 'a1', role: 'assistant', content: '', timestamp: 2, status: 'error' },
            { id: 'u2', role: 'user', content: 'second', timestamp: 3 },
            { id: 'a2', role: 'assistant', content: 'answer two', timestamp: 4, status: 'completed' },
        ];
        const c = client as unknown as {
            _toHistoryMessages: (m: AparteMessage[]) => unknown;
            _messagesToChatMessages: (m: AparteMessage[]) => unknown;
        };
        expect(
            c._messagesToChatMessages(slice),
            'retry/edit and send must not disagree about what history is',
        ).toEqual(c._toHistoryMessages(slice));
    });
});

/**
 * The `history` option's own JSDoc is what the generated reference hands a caller —
 * for most consumers it is the ONLY statement of this rule they will ever read.
 *
 * It said `'viewport' (default) — collects completed messages from the viewport`,
 * and "completed" is the exact word the fix above retired: the gate asks "is this
 * still in flight?" now, so a turn a host seeded with no `status` is history. A
 * caller reading the old sentence is told the pre-fix behaviour, i.e. that seeding a
 * transcript sends nothing — the one wrong belief this whole block exists to correct,
 * and the one that makes a host invent a status it has no reason to have.
 *
 * Same rule as the `@cssprop` clause in CLAUDE.md, on prose: a documented contract has
 * to be read by the code that honours it.
 */
describe('the `history` option documents the rule the code implements', () => {
    const clientDoc = (): string => {
        let file = '';
        for (let dir = process.cwd(), i = 0; i < 6 && !file; i++, dir = dirname(dir)) {
            for (const root of ['packages/core/src', 'src']) {
                const candidate = join(dir, root, 'client', 'aparte-client.ts');
                if (existsSync(candidate)) { file = candidate; break; }
            }
        }
        if (!file) throw new Error(`aparte-client.ts not found from ${process.cwd()}`);
        const source = readFileSync(file, 'utf8');
        const decl = source.indexOf("history?: 'viewport'");
        expect(decl, 'the `history` option was renamed — this assertion reads the wrong symbol').toBeGreaterThan(0);
        const open = source.lastIndexOf('/**', decl);
        return source.slice(open, decl);
    };

    it('does not promise that only "completed" messages are collected', () => {
        expect(
            clientDoc(),
            'the gate stopped asking "is this completed?"; the docblock still says it does',
        ).not.toMatch(/completed/i);
    });

    it('names what is actually held back, and that a status-less turn is history', () => {
        const doc = clientDoc();
        for (const word of ['streaming', 'pending', 'status']) {
            expect(doc, `a caller cannot learn the rule without the word "${word}"`).toContain(word);
        }
    });
});
