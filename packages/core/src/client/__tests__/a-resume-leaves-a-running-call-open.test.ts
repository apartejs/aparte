// @vitest-environment jsdom
/**
 * The history a resume sends leaves a call that is still RUNNING open, as it leaves a
 * paused one.
 *
 * The call that opened a sub-agent stays `pending` while the sub-agent waits for a person
 * under it. A resume used to answer it "The tool call was stopped before it ran" — telling
 * the model a call that is running never ran. It goes out unanswered now, in the same
 * envelope as the paused calls.
 *
 * And the server loop's resume is unchanged: a server pause never leaves a running call
 * behind (each call has settled, or carries its ticket), so the calls left open are exactly
 * the ones the ticket was signed for.
 */
import { describe, it, expect } from 'vitest';
import { webcrypto } from 'node:crypto';
import { unansweredTail } from '@aparte/engine';
import { wireTurns, STOPPED_TOOL_TEXT } from '../wire-history.js';
import { AparteClient } from '../aparte-client.js';
import { AparteConfig } from '../../config/index.js';
import { createAgentStreamRunner } from '../agent-runner.js';
import { createAparteAgentHandler } from '../../transport/agent-handler.js';
import type { AparteAIProvider } from '../../types/model-provider.js';
import type { AparteMessage, AparteSegment, AparteToolCallSegment } from '../../types/index.js';

const textOf = (segments: AparteSegment[]): string =>
    segments.map((s) => (s as { content?: string }).content ?? '').join('');
const text = (id: string, content: string): AparteSegment => ({ id, type: 'text', content } as AparteSegment);
const call = (id: string, status: AparteToolCallSegment['status'], over: Partial<AparteToolCallSegment> = {}): AparteSegment =>
    ({ id: `tool-${id}`, type: 'tool_call', status, toolCall: { id, name: 'delegate', input: { task: id } }, ...over } as AparteSegment);
const reply = (segments: AparteSegment[]): AparteMessage => ({ id: 'a1', role: 'assistant', content: '', segments } as AparteMessage);

describe('a resume leaves a running call open', () => {
    it('sends the running call with no answer, for whoever resumes it', () => {
        const out = wireTurns(reply([text('t', 'Delegating.'), call('c1', 'pending')]), textOf, { openDeferred: true });
        expect(out).toEqual([{ role: 'assistant', content: 'Delegating.', toolCalls: [{ id: 'c1', name: 'delegate', input: { task: 'c1' } }] }]);
        expect(unansweredTail(out as never).map((c) => c.id)).toEqual(['c1']);
    });

    it('answers a finished call beside it, and keeps the running one and a paused one in one envelope', () => {
        const out = wireTurns(reply([
            call('c0', 'resolved', { result: 'read' }),
            call('c1', 'pending'),
            text('t', 'Waiting on you.'),
            call('c2', 'awaiting-approval', { deferred: { reason: 'approval', ticket: 'tk' } }),
        ]), textOf, { openDeferred: true });
        expect(out).toEqual([{
            role: 'assistant',
            content: 'Waiting on you.',
            toolCalls: ['c0', 'c1', 'c2'].map((id) => ({ id, name: 'delegate', input: { task: id } })),
        }, { role: 'tool', content: 'read', toolCallId: 'c0', toolName: 'delegate' }]);
        expect(unansweredTail(out as never).map((c) => c.id)).toEqual(['c1', 'c2']);
    });

    it('leaves open a call waiting for a person with no ticket: the call of a sub-agent whose question is up', () => {
        const out = wireTurns(reply([text('t', 'Delegating.'), call('c1', 'awaiting-approval')]), textOf, { openDeferred: true });
        expect(out).toEqual([{ role: 'assistant', content: 'Delegating.', toolCalls: [{ id: 'c1', name: 'delegate', input: { task: 'c1' } }] }]);
        expect(unansweredTail(out as never).map((c) => c.id)).toEqual(['c1']);
    });

    it('outside a resume, a call that never finished is still answered as stopped', () => {
        const out = wireTurns(reply([call('c1', 'pending')]), textOf);
        expect(out.at(-1)).toEqual({ role: 'tool', content: STOPPED_TOOL_TEXT, toolCallId: 'c1', toolName: 'delegate' });
    });

    it('a call that was stopped is answered as stopped, resume or not', () => {
        const out = wireTurns(reply([call('c1', 'aborted')]), textOf, { openDeferred: true });
        expect(out.at(-1)).toEqual({ role: 'tool', content: STOPPED_TOOL_TEXT, toolCallId: 'c1', toolName: 'delegate' });
    });
});

// ── the server loop's resume, unchanged ─────────────────────────────────────────────

function scriptedProvider(...turns: object[][]): AparteAIProvider {
    return {
        id: 'mock', name: 'Mock',
        async chat() {
            const events = turns.shift() ?? [{ type: 'text', delta: 'end' }, { type: 'done' }];
            return new ReadableStream({ start(c) { for (const e of events) c.enqueue(e); c.close(); } });
        },
    } as unknown as AparteAIProvider;
}

function server(provider: AparteAIProvider) {
    const ran: string[] = [];
    const handler = createAparteAgentHandler({
        providers: { mock: provider },
        authorize: () => true,
        secret: 'resume-secret-that-is-at-least-32-characters',
        crypto: webcrypto.subtle as unknown as SubtleCrypto,
        tools: [
            {
                tool: { name: 'read_file', description: 'Read a file.', inputSchema: { type: 'object' } },
                handler: async (c) => { ran.push(`read ${String(c.input['path'])}`); return { toolCallId: c.id, content: 'contents' }; },
            },
            {
                tool: { name: 'delete_file', description: 'Delete a file.', inputSchema: { type: 'object' }, needsApproval: true },
                handler: async (c) => { ran.push(`delete ${String(c.input['path'])}`); return { toolCallId: c.id, content: 'deleted' }; },
            },
        ],
    });
    const fetch = (async (url: string, init: RequestInit) =>
        handler(new Request(`http://x${url}`, { method: init.method, headers: init.headers, body: init.body }))) as unknown as typeof globalThis.fetch;
    return { fetch, ran };
}

function chat(initial: AparteMessage[] = []) {
    const messages: AparteMessage[] = structuredClone(initial);
    const el = document.createElement('div');
    const last = () => messages[messages.length - 1]!;
    const owner = (id: string) => [...messages].reverse().find((m) => m.segments?.some((s) => s.id === id));
    Object.assign(el, {
        appendMessage: (m: AparteMessage) => { messages.push({ ...m }); },
        updateMessage: (id: string, u: Partial<AparteMessage>) => { const m = messages.find((x) => x.id === id); if (m) Object.assign(m, u); },
        addSegment: (s: AparteSegment) => { const m = last(); m.segments = [...(m.segments ?? []), s]; },
        updateSegment: (id: string, u: Partial<AparteSegment>) => {
            const m = owner(id);
            if (m) m.segments = m.segments!.map((s) => (s.id === id ? { ...s, ...u } as AparteSegment : s));
        },
        updateLastMessage: () => {}, typeName: () => {}, setUsage: () => {},
        getMessages: () => messages,
    });
    document.body.appendChild(el);
    return { el, messages };
}

function client(el: HTMLElement, fetch: typeof globalThis.fetch, approvalResolver: unknown) {
    const cfg = new AparteConfig();
    cfg.registerAIProvider({ id: 'mock', getMetadata: () => ({ id: 'mock', name: 'M' }), getModels: () => [{ id: 'm', name: 'M' }], chat: async () => '' } as never);
    cfg.setModelConfig({ defaultProvider: 'mock', defaultModel: 'm' });
    return new AparteClient({
        config: cfg, autoRegister: false, targetResolver: () => el as never,
        streamRunner: createAgentStreamRunner({ endpoint: '/api/agent', fetch }),
        approvalResolver,
    } as never);
}

const send = (c: AparteClient, content: string) =>
    (c as unknown as { _handleSend: (e: Event) => Promise<void> })._handleSend(new CustomEvent('aparte-send', { detail: { content } }));

const calls = (m: AparteMessage | undefined) => (m?.segments ?? []).filter((s): s is AparteToolCallSegment => s.type === 'tool_call');

describe("the server loop's resume", () => {
    it('a pause leaves no running call behind, and resumes after a reload with the ticket it signed', async () => {
        // One step that reads (runs at once) and deletes twice (each waits for a person).
        const turnWorking = [
            { type: 'text', delta: 'Reading, then deleting.' },
            { type: 'tool_use', id: 'r1', name: 'read_file', input: { path: 'a' } },
            { type: 'tool_use', id: 'd1', name: 'delete_file', input: { path: 'a' } },
            { type: 'tool_use', id: 'd2', name: 'delete_file', input: { path: 'b' } },
            { type: 'done' },
        ];
        const turnDone = [{ type: 'text', delta: 'All done.' }, { type: 'done' }];
        const { fetch, ran } = server(scriptedProvider(turnWorking, turnDone));

        const first = chat();
        let saved: AparteMessage[] = [];
        const c1: AparteClient = client(first.el, fetch, async () => {
            saved = structuredClone(first.messages);
            c1.abort();
            return { approved: false };
        });
        await send(c1, 'clean up');
        expect(ran).toEqual(['read a']);

        // The premise the new rule leans on: every call the pause left unfinished carries
        // its ticket — none is merely running.
        const paused = saved.at(-1)!;
        expect(calls(paused).map((c) => [c.toolCall.id, c.status, Boolean(c.deferred?.ticket)])).toEqual([
            ['r1', 'resolved', false],
            ['d1', 'awaiting-approval', true],
            ['d2', 'awaiting-approval', true],
        ]);
        expect(calls(paused).some((c) => c.status === 'pending' && !c.deferred)).toBe(false);
        // So the calls a resume leaves open are exactly the paused ones.
        const tail = unansweredTail(wireTurns(paused, textOf, { openDeferred: true }) as never);
        expect(tail.map((c) => c.id)).toEqual(['d1', 'd2']);

        // Reloaded and resumed: the server's check of the open calls against its ticket holds.
        const second = chat(saved);
        const c2 = client(second.el, fetch, async () => ({ approved: true }));
        expect(await c2.resumeDeferred(second.el)).toBe(true);
        const done = second.messages.at(-1);
        expect(calls(done).map((c) => c.status)).toEqual(['resolved', 'resolved', 'resolved']);
        expect(ran).toEqual(['read a', 'delete a', 'delete b']);
        expect((done?.segments ?? []).filter((s) => s.type === 'text').map((s) => (s as { content: string }).content).join(' ')).toContain('All done.');
    });
});
