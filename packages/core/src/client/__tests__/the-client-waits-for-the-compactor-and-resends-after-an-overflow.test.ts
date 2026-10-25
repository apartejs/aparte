// @vitest-environment jsdom
/**
 * The client's half of compaction policy: it waits for a summary before a send goes out,
 * records what each request was estimated at, and — when the model refuses a request as
 * longer than its window — compacts and sends the turn once more.
 *
 * Run on the real viewport and the real engine loop, so what is asserted is what a page
 * would see: the requests that reach the transport, the reply's segments and status, and the
 * calls the compactor receives. The compactor is a stub; what it does is the plugin's own
 * concern and is tested there.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AparteConfig, aparteGlobalConfig } from '../../config/aparte-config.js';
import { AparteClient } from '../aparte-client.js';
import { attachConfig } from '../../config/config-context.js';
import { estimateRequestTokens } from '../../context/measure.js';
import { AparteError, AparteErrorCode } from '../../types/errors.js';
import type { AparteCompactor, AparteCompactorOutcome } from '../../types/compactor.js';
import type { AparteChatRequest } from '../../types/chat.js';
import type { AparteMessage, AparteStreamEvent } from '../../types/index.js';
import '../../components/viewport/aparte-chat-viewport.js';

// jsdom has no createObjectURL; every real browser does. The attachment chip's url needs it.
if (typeof URL.createObjectURL !== 'function') {
    (URL as unknown as { createObjectURL: () => string }).createObjectURL = () => 'blob:vitest';
}

type Viewport = HTMLElement & {
    getMessages(): AparteMessage[];
    getMessage(id: string): AparteMessage | undefined;
    updateMessage(id: string, updates: Partial<AparteMessage>): void;
    setMessages(messages: AparteMessage[]): void;
};

/** One call of the transport: the events it streams, or the error it throws. */
type Step = AparteStreamEvent[] | Error;

const OK: Step = [{ type: 'text', delta: 'Done.' } as AparteStreamEvent, { type: 'done' } as AparteStreamEvent];
const overflow = (): AparteError => new AparteError('maximum context length exceeded', AparteErrorCode.USAGE_CONTEXT_EXCEEDED, undefined, undefined, 400);
const checkpoint = { summary: 'The user is planning a trip.', count: 2, createdAt: 10 };
const COMPACTED: AparteCompactorOutcome = { ok: true, skipped: false, summary: checkpoint.summary, kept: 2, dropped: 2 };

const turn = (id: string, role: 'user' | 'assistant'): AparteMessage => ({
    id, role, content: `${role === 'user' ? 'question' : 'answer'} ${id}`, timestamp: 1,
    ...(role === 'assistant' ? { status: 'completed' as const } : {}),
});
/** u1 a1 u2 a2: two answered exchanges, ready for a third. */
const transcript = (): AparteMessage[] => [turn('u1', 'user'), turn('a1', 'assistant'), turn('u2', 'user'), turn('a2', 'assistant')];

const textOf = (m: { content: unknown }): string => (typeof m.content === 'string' ? m.content : JSON.stringify(m.content));
const sentText = (request: AparteChatRequest): string => request.messages.map(textOf).join('\n');

describe('the client and the compactor', () => {
    let viewport: Viewport;
    let config: AparteConfig;
    let seen: AparteChatRequest[];
    let steps: Step[];
    let lifecycle: string[];
    let listeners: AbortController;
    let clients: AparteClient[];

    const stubCompactor = (over: Partial<AparteCompactor> = {}): AparteCompactor => ({
        compact: vi.fn(async () => COMPACTED),
        settled: async () => {},
        beforeSend: vi.fn(async () => false),
        ...over,
    });

    /** What a compaction does to the transcript: the checkpoint lands on the first kept user turn. */
    const writeCheckpoint = (): void => viewport.updateMessage('u2', { contextSummary: checkpoint });

    const send = (content = 'question u3'): void => {
        viewport.dispatchEvent(new CustomEvent('aparte-send', {
            detail: { content, timestamp: Date.now(), targetId: 'chat' }, bubbles: true, composed: true,
        }));
    };
    const reply = (): AparteMessage => viewport.getMessages().filter((m) => m.role === 'assistant').at(-1)!;
    const settled = async (): Promise<void> => {
        await vi.waitFor(() => expect(['completed', 'error']).toContain(reply().status));
    };

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
        config.setKeyProvider(() => 'k');
        seen = [];
        steps = [OK];
        lifecycle = [];
        config.setTransport({
            chat: async (_p: unknown, request: AparteChatRequest) => {
                seen.push(request);
                const step = steps[Math.min(seen.length - 1, steps.length - 1)]!;
                if (step instanceof Error) throw step;
                return new ReadableStream({ start(c) { for (const e of step) c.enqueue(e); c.close(); } });
            },
        } as never);
        // Window listeners outlive a test: one controller removes them with the clients.
        listeners = new AbortController();
        clients = [];
        for (const name of ['aparte-message-start', 'aparte-message-aborted', 'aparte-message-done', 'aparte-message-error']) {
            window.addEventListener(name, () => lifecycle.push(name), { signal: listeners.signal });
        }
        viewport.setMessages(transcript());
    });

    afterEach(() => {
        listeners.abort();
        for (const client of clients) client.stop();
        document.body.innerHTML = '';
        aparteGlobalConfig.reset();
    });

    const start = (): AparteClient => {
        const client = new AparteClient({ config, autoRegister: false });
        client.start();
        clients.push(client);
        return client;
    };

    describe('before a send', () => {
        it('asks once the turn is announced, with the turn being prepared left out and an estimate of the request', async () => {
            const beforeSend = vi.fn(async () => { lifecycle.push('beforeSend'); return false; });
            config.setCompactor(stubCompactor({ beforeSend }));
            start();
            send();
            await settled();

            expect(lifecycle.slice(0, 2), 'after aparte-message-start, so Stop is showing while it waits').toEqual(['aparte-message-start', 'beforeSend']);
            expect(beforeSend).toHaveBeenCalledTimes(1);
            const asked = beforeSend.mock.calls[0]![0] as { target: unknown; targetId?: string; exclude: string[]; requestTokens: number };
            const [user, assistant] = viewport.getMessages().slice(-2);
            expect(asked.target).toBe(viewport);
            expect(asked.targetId).toBe('chat');
            expect(asked.exclude).toEqual([user!.id, assistant!.id]);
            expect(asked.requestTokens).toBeGreaterThan(0);
            expect(asked.requestTokens, 'the estimate of the very request that went out').toBe(estimateRequestTokens(seen[0]!));
        });

        it('builds the request again when it resolves true, so the summary replaces the history it stands for', async () => {
            config.setCompactor(stubCompactor({ beforeSend: vi.fn(async () => { writeCheckpoint(); return true; }) }));
            start();
            send();
            await settled();

            expect(seen).toHaveLength(1);
            const sent = sentText(seen[0]!);
            expect(sent).toContain(checkpoint.summary);
            expect(sent).toContain('question u2');
            expect(sent, 'what the summary stands for is not sent').not.toContain('question u1');
            expect(sent).toContain('question u3');
        });

        it('sends the history as built when it resolves false', async () => {
            config.setCompactor(stubCompactor());
            start();
            send();
            await settled();
            expect(sentText(seen[0]!)).toContain('question u1');
        });

        it('inlines the files again when it builds the request again', async () => {
            config.setCompactor(stubCompactor({ beforeSend: vi.fn(async () => { writeCheckpoint(); return true; }) }));
            start();
            viewport.dispatchEvent(new CustomEvent('aparte-send', {
                detail: { content: 'read this', timestamp: Date.now(), targetId: 'chat', files: [new File(['FILE BODY'], 'notes.txt', { type: 'text/plain' })] },
                bubbles: true, composed: true,
            }));
            await settled();
            expect(sentText(seen[0]!)).toContain('FILE BODY');
            expect(sentText(seen[0]!)).toContain(checkpoint.summary);
        });

        it('ends the turn as stopped when a Stop lands while it waits, and sends nothing', async () => {
            let release: (compacted: boolean) => void = () => {};
            const beforeSend = vi.fn(() => new Promise<boolean>((resolve) => { release = resolve; }));
            config.setCompactor(stubCompactor({ beforeSend }));
            start();
            send();
            await vi.waitFor(() => expect(beforeSend).toHaveBeenCalled());

            window.dispatchEvent(new CustomEvent('aparte-abort', { detail: { targetId: 'chat' } }));
            release(false); // what the plugin does once its summary was cut short

            await vi.waitFor(() => expect(lifecycle).toContain('aparte-message-aborted'));
            expect(seen, 'no request went out').toHaveLength(0);
            expect(reply().status).toBe('completed');
            expect(lifecycle).not.toContain('aparte-message-error');
            expect(lifecycle).not.toContain('aparte-message-done');
        });

        it('sends the request as built when the compactor throws', async () => {
            const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
            config.setCompactor(stubCompactor({ beforeSend: vi.fn(async () => { throw new Error('bug'); }) }));
            start();
            send();
            await settled();
            expect(reply().status).toBe('completed');
            expect(seen).toHaveLength(1);
            warn.mockRestore();
        });

        it('does not ask a compactor that has no beforeSend', async () => {
            const compactor = stubCompactor();
            delete (compactor as { beforeSend?: unknown }).beforeSend;
            config.setCompactor(compactor);
            start();
            send();
            await settled();
            expect(compactor.compact).not.toHaveBeenCalled();
            expect(seen).toHaveLength(1);
        });

        it("reads the compactor of the chat before the client's", async () => {
            // A client on the global config answers every chat, whatever instance config the
            // chat carries — which is the case where the two compactors can differ.
            const fromClient = stubCompactor();
            const fromChat = stubCompactor();
            const global = aparteGlobalConfig;
            global.registerAIProvider({
                id: 'mock', getMetadata: () => ({ id: 'mock', name: 'M' }),
                getModels: () => [{ id: 'm', name: 'M' }], chat: async () => '',
            } as never);
            global.setModelConfig({ defaultProvider: 'mock', defaultModel: 'm' });
            global.setKeyProvider(() => 'k');
            global.setTransport(config.getTransport());
            global.setCompactor(fromClient);
            const chatConfig = new AparteConfig();
            chatConfig.setCompactor(fromChat);
            const host = document.createElement('div');
            attachConfig(host, chatConfig);
            document.body.appendChild(host);
            host.appendChild(viewport);
            viewport.setMessages(transcript());

            const client = new AparteClient({ autoRegister: false });
            client.start();
            clients.push(client);
            send();
            await settled();

            expect(fromChat.beforeSend).toHaveBeenCalledTimes(1);
            expect(fromClient.beforeSend).not.toHaveBeenCalled();
        });
    });

    describe('what a request was estimated at', () => {
        it('is written on the reply before it is sent, so the measure can calibrate against the usage', async () => {
            const estimateWhenSent: Array<number | undefined> = [];
            const original = config.getTransport();
            config.setTransport({
                chat: async (p: never, request: AparteChatRequest, auth: never, ctx: never) => {
                    estimateWhenSent.push(reply().contextEstimate);
                    return original.chat(p, request, auth, ctx);
                },
            } as never);
            start();
            send();
            await settled();

            expect(estimateWhenSent).toHaveLength(1);
            expect(estimateWhenSent[0], 'already there when the request leaves').toBe(estimateRequestTokens(seen[0]!));
            expect(reply().contextEstimate).toBe(estimateRequestTokens(seen[0]!));
        });

        it('is the estimate of the request after a compaction rebuilt it, not before', async () => {
            config.setCompactor(stubCompactor({ beforeSend: vi.fn(async () => { writeCheckpoint(); return true; }) }));
            start();
            send();
            await settled();
            expect(reply().contextEstimate).toBe(estimateRequestTokens(seen[0]!));
        });
    });

    describe('after an overflow', () => {
        it('compacts with force and the turn left out, then sends the turn once more into the same reply', async () => {
            steps = [overflow(), OK];
            const compact = vi.fn(async () => { writeCheckpoint(); return COMPACTED; });
            config.setCompactor(stubCompactor({ compact }));
            start();
            send();
            await settled();

            const [user, assistant] = viewport.getMessages().slice(-2);
            expect(compact).toHaveBeenCalledTimes(1);
            expect(compact).toHaveBeenCalledWith({
                target: viewport, targetId: 'chat', force: true, reason: 'overflow', exclude: [user!.id, assistant!.id],
            });
            expect(seen).toHaveLength(2);
            expect(sentText(seen[0]!)).toContain('question u1');
            expect(sentText(seen[1]!), 'the second request is the smaller one').not.toContain('question u1');
            expect(sentText(seen[1]!)).toContain(checkpoint.summary);

            expect(reply().id, 'the same reply, not a new one').toBe(assistant!.id);
            expect(reply().status).toBe('completed');
            expect((reply().segments ?? []).map((s) => s.type), 'no error, and no note either').toEqual(['text']);
            expect(lifecycle.filter((n) => n === 'aparte-message-start'), 'one turn, announced once').toHaveLength(1);
            expect(lifecycle).not.toContain('aparte-message-error');
        });

        it('records the estimate of the second request on the reply', async () => {
            steps = [overflow(), OK];
            config.setCompactor(stubCompactor({ compact: vi.fn(async () => { writeCheckpoint(); return COMPACTED; }) }));
            start();
            send();
            await settled();
            expect(reply().contextEstimate).toBe(estimateRequestTokens(seen[1]!));
        });

        it('also reads the code from an error event the provider streamed before any text', async () => {
            // The path a 200 that fails mid-stream takes: engine throws, AparteError.from reads the code.
            steps = [[{ type: 'error', message: 'Context size has been exceeded.', code: AparteErrorCode.USAGE_CONTEXT_EXCEEDED } as AparteStreamEvent], OK];
            const compact = vi.fn(async () => { writeCheckpoint(); return COMPACTED; });
            config.setCompactor(stubCompactor({ compact }));
            start();
            send();
            await settled();
            expect(compact).toHaveBeenCalledTimes(1);
            expect(seen).toHaveLength(2);
            expect(reply().status).toBe('completed');
        });

        it('runs once and only once: a second overflow is the error', async () => {
            steps = [overflow(), overflow(), OK];
            const compact = vi.fn(async () => { writeCheckpoint(); return COMPACTED; });
            config.setCompactor(stubCompactor({ compact }));
            start();
            send();
            await settled();

            expect(compact).toHaveBeenCalledTimes(1);
            expect(seen).toHaveLength(2);
            expect(reply().status).toBe('error');
            const error = (reply().segments ?? []).find((s) => s.type === 'error') as { code?: string } | undefined;
            expect(error?.code).toBe(AparteErrorCode.USAGE_CONTEXT_EXCEEDED);
        });

        it('does not resend a reply that already said something: the turn would answer twice', async () => {
            steps = [[
                { type: 'text', delta: 'Half an answer' } as AparteStreamEvent,
                { type: 'error', message: 'too long', code: AparteErrorCode.USAGE_CONTEXT_EXCEEDED } as AparteStreamEvent,
            ], OK];
            const compact = vi.fn(async () => COMPACTED);
            config.setCompactor(stubCompactor({ compact }));
            start();
            send();
            await settled();

            expect(compact).not.toHaveBeenCalled();
            expect(seen).toHaveLength(1);
            expect(reply().status).toBe('error');
            const types = (reply().segments ?? []).map((s) => s.type);
            expect(types).toContain('text');
            expect(types).toContain('error');
        });

        it('leaves the error alone when there is no compactor', async () => {
            steps = [overflow(), OK];
            start();
            send();
            await settled();
            expect(seen).toHaveLength(1);
            expect(reply().status).toBe('error');
        });

        it.each([
            ['skips', { ok: true, skipped: true, reason: 'nothing-to-drop' } as AparteCompactorOutcome],
            ['fails', { ok: false, error: 'boom' } as AparteCompactorOutcome],
        ])('leaves the error alone when the compaction %s', async (_how, outcome) => {
            steps = [overflow(), OK];
            const compact = vi.fn(async () => outcome);
            config.setCompactor(stubCompactor({ compact }));
            start();
            send();
            await settled();

            expect(compact).toHaveBeenCalledTimes(1);
            expect(seen, 'nothing was sent a second time').toHaveLength(1);
            expect(reply().status).toBe('error');
            expect((reply().segments ?? []).some((s) => s.type === 'error')).toBe(true);
        });

        it('leaves the error alone when the compactor throws', async () => {
            steps = [overflow(), OK];
            config.setCompactor(stubCompactor({ compact: vi.fn(async () => { throw new Error('bug'); }) }));
            start();
            send();
            await settled();
            expect(seen).toHaveLength(1);
            expect(reply().status).toBe('error');
        });

        it('does not compact for an error that is not an overflow', async () => {
            steps = [new AparteError('bad request', AparteErrorCode.USAGE_BAD_REQUEST, undefined, undefined, 400), OK];
            const compact = vi.fn(async () => COMPACTED);
            config.setCompactor(stubCompactor({ compact }));
            start();
            send();
            await settled();
            expect(compact).not.toHaveBeenCalled();
            expect(reply().status).toBe('error');
        });

        it('ends the turn as stopped, not failed, when a Stop lands while the summary is written', async () => {
            steps = [overflow(), OK];
            let finish: (o: AparteCompactorOutcome) => void = () => {};
            const compact = vi.fn(() => new Promise<AparteCompactorOutcome>((resolve) => { finish = resolve; }));
            config.setCompactor(stubCompactor({ compact }));
            start();
            send();
            await vi.waitFor(() => expect(compact).toHaveBeenCalled());

            window.dispatchEvent(new CustomEvent('aparte-abort', { detail: { targetId: 'chat' } }));
            finish({ ok: false, error: 'aborted' });

            await vi.waitFor(() => expect(lifecycle).toContain('aparte-message-aborted'));
            expect(seen).toHaveLength(1);
            expect(lifecycle).not.toContain('aparte-message-error');
            expect(reply().status).toBe('completed');
        });
    });

    describe('retry, edit and resume build the request again the way they built it', () => {
        it('a retry sends the summary in place of what it stands for, once a compaction wrote it', async () => {
            config.setCompactor(stubCompactor({ beforeSend: vi.fn(async () => { writeCheckpoint(); return true; }) }));
            start();
            viewport.dispatchEvent(new CustomEvent('aparte-retry', {
                detail: { messageId: 'a2', targetId: 'chat' }, bubbles: true, composed: true,
            }));
            await vi.waitFor(() => expect(seen).toHaveLength(1));

            const sent = sentText(seen[0]!);
            expect(sent).toContain(checkpoint.summary);
            expect(sent).toContain('question u2');
            expect(sent).not.toContain('question u1');
            expect(sent, 'the reply being regenerated is not sent').not.toContain('answer a2');
        });

        it('an edit sends the summary in place of what it stands for', async () => {
            config.setCompactor(stubCompactor({ beforeSend: vi.fn(async () => { viewport.updateMessage('u2', { contextSummary: checkpoint }); return true; }) }));
            start();
            viewport.setMessages([...transcript(), turn('u3', 'user'), turn('a3', 'assistant')]);
            viewport.dispatchEvent(new CustomEvent('aparte-edit', {
                detail: { messageId: 'u3', content: 'edited question', targetId: 'chat' }, bubbles: true, composed: true,
            }));
            await vi.waitFor(() => expect(seen).toHaveLength(1));

            const sent = sentText(seen[0]!);
            expect(sent).toContain(checkpoint.summary);
            expect(sent).toContain('edited question');
            expect(sent).not.toContain('question u1');
        });

        it('a retry that overflows compacts and resends too', async () => {
            steps = [overflow(), OK];
            const compact = vi.fn(async () => { writeCheckpoint(); return COMPACTED; });
            config.setCompactor(stubCompactor({ compact }));
            start();
            viewport.dispatchEvent(new CustomEvent('aparte-retry', {
                detail: { messageId: 'a2', targetId: 'chat' }, bubbles: true, composed: true,
            }));
            await vi.waitFor(() => expect(seen).toHaveLength(2));
            expect(compact).toHaveBeenCalledTimes(1);
            expect(sentText(seen[1]!)).toContain(checkpoint.summary);
            expect(sentText(seen[1]!)).not.toContain('question u1');
        });
    });
});
