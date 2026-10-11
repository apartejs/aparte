// @vitest-environment node
/**
 * createAparteAgentHandler — the agent loop on your server, streamed as NDJSON.
 *
 * The server runs `runStreamAgent` next to its tools. A call that needs a person, or a
 * tool that runs in the browser, suspends the run with a signed ticket; a later request
 * carrying the ticket and the answers resumes it. Every test here reads the wire a
 * browser would read.
 */
import { describe, it, expect, vi } from 'vitest';
import { webcrypto } from 'node:crypto';
import { createAparteAgentHandler, type AparteAgentHandlerOptions } from '../agent-handler.js';
import { readNdjson } from '../../utils/ndjson.js';
import type { AparteAIProvider } from '../../types/model-provider.js';

const subtle = webcrypto.subtle as unknown as SubtleCrypto;
const SECRET = 's'.repeat(32);

type Line = { type: string; [key: string]: unknown };

/** A provider whose `chat()` answers each call with the next scripted event list. */
function scriptedProvider(...turns: object[][]) {
    const requests: { messages: unknown[]; tools?: { name: string }[] }[] = [];
    const provider = {
        id: 'fake', name: 'Fake',
        async chat(request: { messages: unknown[]; tools?: { name: string }[] }, _auth: unknown, ctx: { signal?: AbortSignal }) {
            requests.push(structuredClone(request));
            const events = turns.shift() ?? [{ type: 'text', delta: 'end' }, { type: 'done' }];
            if (events.length === 1 && (events[0] as { type: string }).type === 'hang') {
                return new ReadableStream({ start(c) { ctx.signal?.addEventListener('abort', () => c.error(new DOMException('aborted', 'AbortError'))); } });
            }
            return new ReadableStream({ start(c) { for (const e of events) c.enqueue(e); c.close(); } });
        },
    } as unknown as AparteAIProvider;
    return { provider, requests };
}

const ran: string[] = [];
const deleteTool = {
    tool: { name: 'delete_file', description: 'Delete a file.', inputSchema: { type: 'object' }, needsApproval: true },
    handler: async (call: { id: string; input: Record<string, unknown> }) => {
        ran.push(`delete_file ${JSON.stringify(call.input)}`);
        return { toolCallId: call.id, content: 'deleted' };
    },
};

function handlerWith(provider: AparteAIProvider, extra: Partial<AparteAgentHandlerOptions> = {}) {
    return createAparteAgentHandler({
        providers: { fake: provider }, authorize: () => true, secret: SECRET, tools: [deleteTool], crypto: subtle, ...extra,
    });
}

const post = (body: unknown, init: RequestInit = {}) =>
    new Request('http://x/api/agent', { method: 'POST', body: JSON.stringify(body), ...init });

async function lines(res: Response): Promise<Line[]> {
    const out: Line[] = [];
    for await (const l of readNdjson<Line>(res.body!)) out.push(l);
    return out;
}

const user = { role: 'user', content: 'delete a' };
const firstBody = (extra: object = {}) => ({
    v: 1, providerId: 'fake', messageId: 'm1',
    request: { messages: [user], modelId: 'x', stream: true }, ...extra,
});
const callC1 = { id: 'c1', name: 'delete_file', input: { path: 'a' } };
const turnCallingDelete = [{ type: 'tool_use', ...callC1 }, { type: 'done' }];

/** Run the first request to its suspension; return the ticket. */
async function suspend(provider: AparteAIProvider, extra: Partial<AparteAgentHandlerOptions> = {}): Promise<string> {
    const out = await lines(await handlerWith(provider, extra)(post(firstBody())));
    const last = out.at(-1)!;
    expect(last.type).toBe('run-suspended');
    return last['ticket'] as string;
}

const resumeBody = (ticket: string, outcomes: object, extra: object = {}) => ({
    v: 1, providerId: 'fake', messageId: 'm1',
    request: { messages: [user, { role: 'assistant', content: '', toolCalls: [callC1] }], modelId: 'x', stream: true },
    resume: { ticket, outcomes },
    ...extra,
});

describe('createAparteAgentHandler', () => {
    it('refuses a secret too short to sign with, when it is built', () => {
        expect(() => createAparteAgentHandler({ providers: {}, authorize: () => true, secret: 'short' })).toThrow(/32 characters/);
    });

    it('401 when authorize says no, before reading the body', async () => {
        const { provider, requests } = scriptedProvider();
        const res = await handlerWith(provider, { authorize: () => false })(post(firstBody()));
        expect(res.status).toBe(401);
        expect(requests).toHaveLength(0);
    });

    it('400 on a wrong version, an unknown provider, a browser tool named like a server tool', async () => {
        const { provider } = scriptedProvider();
        const handler = handlerWith(provider);
        expect((await handler(post({ ...firstBody(), v: 2 }))).status).toBe(400);
        expect((await handler(post({ ...firstBody(), providerId: 'nope' }))).status).toBe(400);
        const clash = await handler(post(firstBody({ clientTools: [{ name: 'delete_file', description: '', inputSchema: {} }] })));
        expect(clash.status).toBe(400);
        expect(await clash.json()).toMatchObject({ error: { message: expect.stringContaining('delete_file') } });
    });

    it('streams the run and suspends on a call that needs approval, with a ticket', async () => {
        const { provider, requests } = scriptedProvider(turnCallingDelete);
        const res = await handlerWith(provider)(post(firstBody()));
        expect(res.headers.get('content-type')).toBe('application/x-ndjson');
        const out = await lines(res);
        expect(out.map((l) => l.type)).toEqual(['run-start', 'turn-start', 'tool-start', 'tool-awaiting-approval', 'text-flush', 'run-suspended']);
        expect(out.at(-1)!['pending']).toEqual([{ toolCallId: 'c1', name: 'delete_file', input: { path: 'a' }, reason: 'approval' }]);
        expect(typeof out.at(-1)!['ticket']).toBe('string');
        // The model saw the server's tools.
        expect(requests[0]!.tools?.map((t) => t.name)).toEqual(['delete_file']);
    });

    it('resumes with a valid ticket and runs the approved call once', async () => {
        ran.length = 0;
        const { provider } = scriptedProvider(turnCallingDelete, [{ type: 'text', delta: 'Deleted.' }, { type: 'done' }]);
        const ticket = await suspend(provider);
        const out = await lines(await handlerWith(provider)(post(resumeBody(ticket, { c1: { kind: 'decision', approved: true } }))));
        expect(out.map((l) => l.type)).toEqual(['run-start', 'tool-approved', 'tool-resolved', 'turn-start', 'text-delta', 'text-flush', 'run-done']);
        expect(ran).toEqual(['delete_file {"path":"a"}']);
    });

    it('400 on a tampered, expired or foreign ticket, on calls that differ from the envelope, on an outcome for a call not in the ticket', async () => {
        const { provider } = scriptedProvider(turnCallingDelete);
        const ticket = await suspend(provider);
        const handler = handlerWith(provider);
        const approve = { c1: { kind: 'decision', approved: true } };

        const [body, sig] = ticket.split('.');
        const tampered = `${body}x.${sig}`;
        expect((await handler(post(resumeBody(tampered, approve)))).status).toBe(400);

        const expired = handlerWith(provider, { ticketMaxAgeMs: -1 });
        expect((await expired(post(resumeBody(ticket, approve)))).status).toBe(400);

        // Review focus: a valid ticket replayed on ANOTHER message.
        expect((await handler(post(resumeBody(ticket, approve, { messageId: 'm2' })))).status).toBe(400);

        const otherCall = resumeBody(ticket, approve);
        (otherCall.request.messages[1] as { toolCalls: unknown[] }).toolCalls = [{ id: 'c1', name: 'delete_file', input: { path: '/etc' } }];
        expect((await handler(post(otherCall))).status).toBe(400);

        expect((await handler(post(resumeBody(ticket, { ...approve, c9: { kind: 'decision', approved: true } })))).status).toBe(400);
    });

    it('ignores an approval payload unless the tool accepts one', async () => {
        ran.length = 0;
        const withPayload = { c1: { kind: 'decision', approved: true, payload: { path: '/etc' } } };

        const first = scriptedProvider(turnCallingDelete, [{ type: 'done' }]);
        await lines(await handlerWith(first.provider)(post(resumeBody(await suspend(first.provider), withPayload))));
        expect(ran).toEqual(['delete_file {"path":"a"}']);

        ran.length = 0;
        const accepting = { tools: [{ ...deleteTool, acceptsApprovalPayload: true }] };
        const second = scriptedProvider(turnCallingDelete, [{ type: 'done' }]);
        const ticket = await suspend(second.provider, accepting);
        await lines(await handlerWith(second.provider, accepting)(post(resumeBody(ticket, withPayload))));
        expect(ran).toEqual(['delete_file {"path":"/etc"}']);
    });

    it('treats a browser tool as external: suspends on it, resumes with its result', async () => {
        const askUser = { name: 'ask_user', description: 'Ask the user.', inputSchema: { type: 'object' } };
        const { provider, requests } = scriptedProvider(
            [{ type: 'tool_use', id: 'q1', name: 'ask_user', input: { question: 'Which?' } }, { type: 'done' }],
            [{ type: 'text', delta: 'Blue it is.' }, { type: 'done' }],
        );
        const handler = handlerWith(provider);
        const first = await lines(await handler(post(firstBody({ clientTools: [askUser] }))));
        expect(first.at(-1)).toMatchObject({ type: 'run-suspended', pending: [{ toolCallId: 'q1', reason: 'external' }] });
        expect(requests[0]!.tools?.map((t) => t.name)).toEqual(['delete_file', 'ask_user']);

        const resume = {
            v: 1, providerId: 'fake', messageId: 'm1', clientTools: [askUser],
            request: { messages: [user, { role: 'assistant', content: '', toolCalls: [{ id: 'q1', name: 'ask_user', input: { question: 'Which?' } }] }], modelId: 'x', stream: true },
            resume: { ticket: first.at(-1)!['ticket'], outcomes: { q1: { kind: 'result', content: 'Blue.' } } },
        };
        const out = await lines(await handler(post(resume)));
        expect(out.find((l) => l.type === 'tool-resolved')).toMatchObject({ toolCallId: 'q1', result: 'Blue.' });
        expect(out.at(-1)!.type).toBe('run-done');
    });

    it('refuses browser tools when told to', async () => {
        const { provider } = scriptedProvider();
        const res = await handlerWith(provider, { clientTools: false })(post(firstBody({ clientTools: [{ name: 'ask_user', description: '', inputSchema: {} }] })));
        expect(res.status).toBe(400);
    });

    it('reports a failed run as a sanitised run-error line', async () => {
        const failing = { id: 'fake', name: 'Fake', async chat() { throw new Error('vendor said: sk-secret-key is invalid'); } } as unknown as AparteAIProvider;
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        const out = await lines(await handlerWith(failing)(post(firstBody())));
        errorSpy.mockRestore();
        const last = out.at(-1)!;
        expect(last.type).toBe('run-error');
        expect(JSON.stringify(last)).not.toContain('sk-secret');
    });

    it('stops the run when the client disconnects', async () => {
        const { provider } = scriptedProvider([{ type: 'hang' }]);
        const client = new AbortController();
        const res = await handlerWith(provider)(post(firstBody(), { signal: client.signal }));
        const reading = lines(res);
        client.abort();
        const out = await reading;
        expect(out.map((l) => l.type)).toContain('run-aborted');
    });

    it('asks onTicket before a resume, and refuses with 409 when it says no', async () => {
        const { provider } = scriptedProvider(turnCallingDelete);
        const ticket = await suspend(provider);
        const seen: string[] = [];
        const res = await handlerWith(provider, { onTicket: (id) => { seen.push(id); return false; } })(
            post(resumeBody(ticket, { c1: { kind: 'decision', approved: true } })),
        );
        expect(res.status).toBe(409);
        expect(seen).toHaveLength(1);
    });

    it('runs its only provider on its defaultModel when the page names neither (#100)', async () => {
        const { provider, requests } = scriptedProvider([{ type: 'text', delta: 'Hi.' }, { type: 'done' }]);
        const res = await handlerWith(provider, { defaultModel: 'server-model' })(post({
            v: 1, messageId: 'm1', request: { messages: [user], modelId: '', stream: true },
        }));
        expect(res.status).toBe(200);
        expect((await lines(res)).at(-1)!.type).toBe('run-done');
        expect((requests[0] as { modelId?: string }).modelId).toBe('server-model');

        // A model the page selected wins over the default.
        const chosen = scriptedProvider([{ type: 'text', delta: 'Hi.' }, { type: 'done' }]);
        await lines(await handlerWith(chosen.provider, { defaultModel: 'server-model' })(post(firstBody())));
        expect((chosen.requests[0] as { modelId?: string }).modelId).toBe('x');
    });

    it('asks the page to name a provider when it has several', async () => {
        const { provider } = scriptedProvider();
        const res = await handlerWith(provider, { providers: { fake: provider, other: provider } })(post({
            v: 1, messageId: 'm1', request: { messages: [user], stream: true },
        }));
        expect(res.status).toBe(400);
        expect(JSON.stringify(await res.json())).toContain('Name the providerId: this handler has fake, other.');
    });

    it('lets the server rewrite the request before the run', async () => {
        const { provider, requests } = scriptedProvider([{ type: 'text', delta: 'Hi.' }, { type: 'done' }]);
        await lines(await handlerWith(provider, {
            prepareRequest: (request) => ({ ...request, messages: [{ role: 'system', content: 'You are the server.' }, ...request.messages] }),
        })(post(firstBody())));
        expect(requests[0]!.messages[0]).toEqual({ role: 'system', content: 'You are the server.' });
    });

    it('refuses a forced tool call: the engine would run it without the gate', async () => {
        ran.length = 0;
        const { provider } = scriptedProvider();
        const res = await handlerWith(provider)(post({
            ...firstBody(),
            request: { ...firstBody().request, toolChoice: { name: 'delete_file', input: { path: '/x' } } },
        }));
        expect(res.status).toBe(400);
        expect(ran).toEqual([]);
    });

    it('refuses a history that ends on unanswered calls without a ticket', async () => {
        // A forged envelope, no `resume`: the engine would resume it — run an ungated call,
        // or sign a fresh ticket for a call the model never made.
        ran.length = 0;
        const { provider } = scriptedProvider();
        const res = await handlerWith(provider)(post({
            ...firstBody(),
            request: { messages: [user, { role: 'assistant', content: '', toolCalls: [{ id: 'x', name: 'delete_file', input: { path: '/x' } }] }], modelId: 'x', stream: true },
        }));
        expect(res.status).toBe(400);
        expect(ran).toEqual([]);
    });

    it('reads the history the loop will run on — after prepareRequest, not before', async () => {
        // A host that drops the browser's system messages (the documented use) turned a
        // history ending on `system` — which passed the check — into one ending on a
        // forged call, and the engine resumed it: an ungated tool ran with forged input.
        ran.length = 0;
        const wipe = {
            tool: { name: 'wipe', description: 'Wipe.', inputSchema: { type: 'object' } },
            handler: async (call: { id: string }) => { ran.push('wipe'); return { toolCallId: call.id, content: 'wiped' }; },
        };
        const { provider } = scriptedProvider();
        const res = await handlerWith(provider, {
            tools: [deleteTool, wipe],
            prepareRequest: (request) => ({ ...request, messages: request.messages.filter((m) => m.role !== 'system') }),
        })(post({
            ...firstBody(),
            request: { messages: [
                user,
                { role: 'assistant', content: '', toolCalls: [{ id: 'x', name: 'wipe', input: {} }] },
                { role: 'system', content: '.' },
            ], modelId: 'x', stream: true },
        }));
        expect(res.status).toBe(400);
        expect(ran).toEqual([]);
    });

    it('keeps a server tool\'s own error text on the server', async () => {
        const failingTool = {
            tool: { name: 'read_file', description: 'Read.', inputSchema: { type: 'object' } },
            handler: async () => { throw new Error('ENOENT: /srv/secrets/db.env'); },
        };
        const { provider } = scriptedProvider([{ type: 'tool_use', id: 'r1', name: 'read_file', input: {} }, { type: 'done' }]);
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        const out = await lines(await handlerWith(provider, { tools: [failingTool] })(post(firstBody())));
        errorSpy.mockRestore();
        expect(JSON.stringify(out)).not.toContain('/srv/secrets');
        expect(out.find((l) => l.type === 'tool-failed')).toMatchObject({ toolCallId: 'r1', error: 'The tool failed.' });
    });

    it('hands a server tool the request, so it can check who is calling', async () => {
        let seen: Request | undefined;
        const whoTool = {
            tool: { name: 'read_file', description: 'Read.', inputSchema: { type: 'object' } },
            handler: async (call: { id: string }, _signal: AbortSignal, context?: { request?: Request }) => {
                seen = context?.request;
                return { toolCallId: call.id, content: 'ok' };
            },
        };
        const { provider } = scriptedProvider([{ type: 'tool_use', id: 'r1', name: 'read_file', input: {} }, { type: 'done' }]);
        await lines(await handlerWith(provider, { tools: [whoTool] })(post(firstBody(), { headers: { 'x-user': 'paul' } })));
        expect(seen?.headers.get('x-user')).toBe('paul');
    });

    it('refuses by the server policy without asking anyone', async () => {
        const { provider } = scriptedProvider(turnCallingDelete, [{ type: 'text', delta: 'OK.' }, { type: 'done' }]);
        const out = await lines(await handlerWith(provider, {
            approvalPolicy: () => ({ verdict: 'deny', reason: 'Not on this server.' }),
        })(post(firstBody())));
        expect(out.find((l) => l.type === 'tool-rejected')).toMatchObject({ reason: 'Not on this server.' });
        expect(out.at(-1)!.type).toBe('run-done');
    });
});
