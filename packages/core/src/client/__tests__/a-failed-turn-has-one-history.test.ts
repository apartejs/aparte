// @vitest-environment jsdom
/**
 * After a failed turn, every later request tells the same past.
 *
 * The person sends U1, the turn fails, they send U2, then U3. The send used to cut the
 * history at the last ANSWERED reply, so U2's request left U1 out; U3's cut fell after
 * A2, U1 came back, and the merge joined it to U2. The same message U2 went out alone
 * once and joined to U1 on every request after it: a server that compares the history it
 * is sent with its own record saw the past change under it.
 *
 * One rule now, decided by the code the failed reply's error carries. A failure the same
 * request can get past (the network, the provider, a rate limit, a key) keeps the
 * message: it goes with the next one, from the next request on, as retry and edit already
 * sent it. A failure the same request will meet again (too long for the window, refused by
 * the provider's policy, a malformed request) drops it, or it would fail every turn after
 * it. A message that carried files is dropped too: a request never sends its text
 * without them.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { AparteClient } from '../aparte-client.js';
import { AparteConfig } from '../../config/index.js';
import { AparteError, AparteErrorCode } from '../../types/errors.js';
import { estimateWireTokens } from '../../context/measure.js';
import type { AparteChatMessage } from '../../types/chat.js';
import type { AparteMessage, AparteSegment } from '../../types/index.js';
import type { AparteStreamRunOptions } from '../stream-adapter.js';

beforeAll(() => {
    // jsdom has no object URLs; the echoed bubble of a send with files makes one.
    if (typeof URL.createObjectURL !== 'function') {
        Object.assign(URL, { createObjectURL: () => 'blob:test', revokeObjectURL: () => {} });
    }
});

/** A chat target that keeps what it is told, the way a viewport does. */
function chat() {
    const messages: AparteMessage[] = [];
    const el = document.createElement('div');
    const last = () => messages[messages.length - 1]!;
    Object.assign(el, {
        appendMessage: (m: AparteMessage) => { messages.push({ ...m }); },
        updateMessage: (id: string, u: Partial<AparteMessage>) => {
            const m = messages.find((x) => x.id === id);
            if (m) Object.assign(m, u);
        },
        addSegment: (s: AparteSegment) => { const m = last(); m.segments = [...(m.segments ?? []), s]; },
        updateSegment: (id: string, u: Partial<AparteSegment>) => {
            const m = last();
            if (m.segments) m.segments = m.segments.map((s) => (s.id === id ? { ...s, ...u } as AparteSegment : s));
        },
        updateLastMessage: () => {}, typeName: () => {}, setUsage: () => {},
        getMessages: () => messages,
        getMessage: (id: string) => messages.find((m) => m.id === id),
    });
    document.body.appendChild(el);
    return { el, messages };
}

/** One outcome per turn: a reply, a failure with its code, or a Stop before the first token. */
type Outcome = string | AparteErrorCode | 'stop';

/** A client whose runner plays the outcomes in order and records the history each turn sent. */
function conversation(...outcomes: Outcome[]) {
    const { el, messages } = chat();
    const sent: AparteChatMessage[][] = [];
    let turn = 0;
    const cfg = new AparteConfig();
    cfg.setModelConfig({ defaultProvider: 'remote', defaultModel: 'm' });
    const client = new AparteClient({
        config: cfg, autoRegister: false, targetResolver: () => el,
        streamRunner: async (opts: AparteStreamRunOptions) => {
            sent.push(opts.baseRequest.messages.filter((m) => m.role === 'user' || m.role === 'assistant') as AparteChatMessage[]);
            const outcome = outcomes[turn++] ?? 'ok';
            if (outcome === 'stop') {
                client.abort();
                return undefined;
            }
            if ((Object.values(AparteErrorCode) as string[]).includes(outcome)) {
                throw new AparteError(`failed: ${outcome}`, outcome as AparteErrorCode);
            }
            opts.emitter({ type: 'run-start' });
            opts.emitter({ type: 'turn-start' });
            opts.emitter({ type: 'text-delta', delta: outcome });
            opts.emitter({ type: 'text-flush' });
            opts.emitter({ type: 'run-done' });
            return undefined;
        },
    });
    const send = async (content: string, files?: File[]): Promise<void> => {
        // What the window listener does before it hands a send over: a fresh turn.
        const c = client as unknown as { _beginUserTurn: () => void; _handleSend: (e: Event) => Promise<void> };
        c._beginUserTurn();
        await c._handleSend(
            new CustomEvent('aparte-send', { detail: { content, ...(files ? { files } : {}) } }),
        );
    };
    return { send, sent, messages };
}

const texts = (history: AparteChatMessage[]): string[] =>
    history.map((m) => `${m.role}: ${typeof m.content === 'string' ? m.content : m.content.map((p) => (p.type === 'text' ? p.text : `[${p.type}]`)).join('')}`);

const KEPT = [
    AparteErrorCode.NET_ERROR, AparteErrorCode.NET_OFFLINE, AparteErrorCode.NET_TIMEOUT,
    AparteErrorCode.PROVIDER_ERROR, AparteErrorCode.PROVIDER_UNAVAILABLE, AparteErrorCode.PROVIDER_MISCONFIGURED,
    AparteErrorCode.USAGE_RATE_LIMIT, AparteErrorCode.CONFIG_INVALID_KEY, AparteErrorCode.CONFIG_MISSING_KEY,
    AparteErrorCode.CONFIG_INVALID_MODEL, AparteErrorCode.UNKNOWN_ERROR,
];
const DROPPED = [AparteErrorCode.USAGE_CONTEXT_EXCEEDED, AparteErrorCode.PROVIDER_POLICY, AparteErrorCode.USAGE_BAD_REQUEST];

describe('after a failed turn, every later request tells the same past', () => {
    for (const code of KEPT) {
        it(`${code}: the failed message goes with the next one, from the next request on`, async () => {
            const { send, sent } = conversation('A0', code, 'A2', 'A3');
            await send('U0');
            await send('U1');
            await send('U2');
            await send('U3');
            expect(texts(sent[2]!)).toEqual(['user: U0', 'assistant: A0', 'user: U1\n\nU2']);
            // The request after it starts with exactly the one before.
            expect(texts(sent[3]!)).toEqual([...texts(sent[2]!), 'assistant: A2', 'user: U3']);
        });
    }

    for (const code of DROPPED) {
        it(`${code}: the failed message is left out of every later request`, async () => {
            const { send, sent } = conversation('A0', code, 'A2', 'A3');
            await send('U0');
            await send('U1');
            await send('U2');
            await send('U3');
            expect(texts(sent[2]!)).toEqual(['user: U0', 'assistant: A0', 'user: U2']);
            expect(texts(sent[3]!)).toEqual([...texts(sent[2]!), 'assistant: A2', 'user: U3']);
        });
    }

    it('a Stop before the first token keeps the message, like a failure the request can get past', async () => {
        const { send, sent } = conversation('A0', 'stop', 'A2', 'A3');
        await send('U0');
        await send('U1');
        await send('U2');
        await send('U3');
        expect(texts(sent[2]!)).toEqual(['user: U0', 'assistant: A0', 'user: U1\n\nU2']);
        expect(texts(sent[3]!)).toEqual([...texts(sent[2]!), 'assistant: A2', 'user: U3']);
    });

    it('a failure the request cannot get past drops the messages that went out with it', async () => {
        // U1 failed on the network, so U2's request carried both; that one was refused.
        const { send, sent } = conversation('A0', AparteErrorCode.NET_ERROR, AparteErrorCode.PROVIDER_POLICY, 'A3', 'A4');
        await send('U0');
        await send('U1');
        await send('U2');
        await send('U3');
        await send('U4');
        expect(texts(sent[3]!)).toEqual(['user: U0', 'assistant: A0', 'user: U3']);
        expect(texts(sent[4]!)).toEqual([...texts(sent[3]!), 'assistant: A3', 'user: U4']);
    });

    it('a failed message that carried a file is never sent again without it', async () => {
        const { send, sent } = conversation('A0', AparteErrorCode.NET_ERROR, 'A2', 'A3');
        await send('U0');
        await send('what does this say?', [new File(['secret plan'], 'notes.txt', { type: 'text/plain' })]);
        // The file went with the failed request.
        expect(texts(sent[1]!).at(-1)).toContain('secret plan');
        await send('U2');
        await send('U3');
        expect(texts(sent[2]!)).toEqual(['user: U0', 'assistant: A0', 'user: U2']);
        expect(texts(sent[3]!)).toEqual([...texts(sent[2]!), 'assistant: A2', 'user: U3']);
    });

    it('the gauge counts what the next request sends', async () => {
        for (const [code, kept] of [[AparteErrorCode.NET_ERROR, true], [AparteErrorCode.PROVIDER_POLICY, false]] as const) {
            const { send, messages } = conversation('A0', code);
            await send('U0');
            await send('a long message the person wrote, which failed');
            const answered = messages.slice(0, 2);
            const asked = messages.slice(0, 3);
            expect(estimateWireTokens(messages), code).toBe(estimateWireTokens(kept ? asked : answered));
        }
    });
});
