import { runStreamAgent, unansweredTail } from '@aparte/engine';
import type { StreamChatRequest, StreamDeferredOutcome, StreamRunEvent } from '@aparte/engine';
import type { AparteChatRequest, AparteStreamEvent } from '../types/chat.js';
import type { AparteAIProvider } from '../types/model-provider.js';
import type { AparteApprovalPolicy, AparteTool, AparteToolCall, AparteToolHandler } from '../types/tools.js';
import type { AparteTransport } from './types.js';
import { AparteDirectTransport } from './direct-transport.js';
import { AparteError } from '../types/errors.js';
import { readableToAsyncIterable } from '../client/stream-adapter.js';
import { sameCalls, signTicket, verifyTicket, type AparteTicketCall } from './agent-ticket.js';

/** A server tool: its definition (what the model sees) and its handler (what runs here). */
export interface AparteAgentTool {
    tool: AparteTool;
    handler: AparteToolHandler;
    /**
     * Accept the `payload` an approval may carry — data merged into the call's input.
     * Off by default: from a browser, a payload rewrites what the model chose to call
     * with, so only a tool whose approval UI edits the arguments on purpose opts in.
     */
    acceptsApprovalPayload?: boolean;
}

export interface AparteAgentHandlerOptions {
    /** Your server-side format adapters, keyed by the `providerId` the client sends. */
    providers: Record<string, AparteAIProvider>;
    /**
     * Gate run on EVERY request before any work. **Required**, for the reason
     * `createAparteChatHandler` gives: this endpoint spends your key and runs your
     * tools. Return `false` for 401, a `Response` to answer yourself, `true` to proceed.
     */
    authorize: (req: Request) => boolean | Response | Promise<boolean | Response>;
    /**
     * Signs the pending calls of a suspended run, so a resume runs only calls this
     * server emitted. **Required**, at least 32 characters. An array rotates: the first
     * signs, all verify.
     */
    secret: string | readonly string[];
    /** The tools that run here. `tool.needsApproval` is the gate. */
    tools?: readonly AparteAgentTool[];
    /** The vendor key for a providerId, from env or a secret store. */
    resolveKey?: (providerId: string) => string | undefined | Promise<string | undefined>;
    /** Server-side rules, per call: `allow`, `ask`, `deny` (refused without asking). */
    approvalPolicy?: AparteApprovalPolicy;
    /**
     * Accept tools the browser declares and runs itself (`ask_user`). `true` by default;
     * `false` refuses them; a list allows those names only. A browser tool named like a
     * server tool is always refused.
     */
    clientTools?: boolean | readonly string[];
    /** Rewrite the request before the run — impose your system prompt, drop messages. */
    prepareRequest?: (request: AparteChatRequest, req: Request) => AparteChatRequest | Promise<AparteChatRequest>;
    maxTurns?: number;
    toolTimeoutMs?: number;
    /** How long a suspended run can wait for its answer. @default 7 days */
    ticketMaxAgeMs?: number;
    /**
     * Called with a ticket's id before a resume. Return `false` to refuse it (409) — the
     * hook for a host that can remember used tickets and make them single-use. A server
     * that stores nothing cannot tell a replay from a first use.
     */
    onTicket?: (ticketId: string) => boolean | Promise<boolean>;
    /** How the vendor is called. @default an `AparteDirectTransport` (the key is on this server by design). */
    transport?: AparteTransport;
    /** Web Crypto. @default `globalThis.crypto.subtle`; on Node 18, pass `(await import('node:crypto')).webcrypto.subtle`. */
    crypto?: SubtleCrypto;
}

/** What `createAgentStreamRunner` POSTs. */
export interface AparteAgentRequestBody {
    v: 1;
    providerId: string;
    messageId: string;
    request: AparteChatRequest;
    /** Definitions of the tools the browser runs; the server marks them external. */
    clientTools?: AparteTool[];
    resume?: { ticket: string; outcomes: Record<string, StreamDeferredOutcome> };
}

const DEFAULT_TICKET_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Build a framework-free handler that runs the agent loop on your server — next to your
 * tools — and streams it to `createAgentStreamRunner` in the browser.
 *
 * The browser's `AparteClient` keeps doing what it does: rows, Stop, the approval panel
 * and your approval policy. A call that needs a person, or a tool that runs in the
 * browser, SUSPENDS the run: the stream ends on `run-suspended` with a signed ticket, the
 * page asks, and a second request carries the ticket and the answer. Nothing is stored
 * here — the paused call lives in the conversation the app saves — so the person can
 * leave and answer days later.
 *
 * The wire is NDJSON: one `StreamRunEvent` per line, the suspension line with its
 * `ticket`, and a `run-error` line (sanitised) when the run fails after the stream began.
 *
 * ```ts
 * // app/api/agent/route.ts (Next.js)
 * import { createAparteAgentHandler } from '@aparte/core';
 * export const POST = createAparteAgentHandler({
 *   providers: { openai: createOpenAICompatProvider(presets.OPENAI) },
 *   resolveKey: () => process.env.OPENAI_KEY,
 *   authorize: (req) => isSignedIn(req),
 *   secret: process.env.AGENT_SECRET!,
 *   tools: [{ tool: readFile, handler: readFileHandler }],
 * });
 * ```
 */
export function createAparteAgentHandler(options: AparteAgentHandlerOptions): (req: Request) => Promise<Response> {
    const secrets = typeof options.secret === 'string' ? [options.secret] : [...options.secret];
    if (secrets.length === 0 || secrets.some((s) => typeof s !== 'string' || s.length < 32)) {
        throw new Error('createAparteAgentHandler: `secret` must be at least 32 characters — it signs the pending tool calls of a suspended run.');
    }
    const tools = new Map((options.tools ?? []).map((t) => [t.tool.name, t]));
    // A server holds the vendor key by design, so the browser-key warning does not apply.
    const transport = options.transport ?? new AparteDirectTransport({ byok: true });
    const maxAge = options.ticketMaxAgeMs ?? DEFAULT_TICKET_MAX_AGE_MS;

    return async function handler(req: Request): Promise<Response> {
        const verdict = await options.authorize(req);
        if (verdict instanceof Response) return verdict;
        if (!verdict) return jsonError(401, 'Unauthorized.');

        const subtle = options.crypto ?? globalThis.crypto?.subtle;
        if (!subtle) {
            return jsonError(500, 'No Web Crypto here: pass `crypto` (on Node 18, the `webcrypto.subtle` of the built-in crypto module).');
        }

        let body: AparteAgentRequestBody;
        try {
            body = (await req.json()) as AparteAgentRequestBody;
        } catch {
            return jsonError(400, 'Invalid JSON body.');
        }
        if (body?.v !== 1) return jsonError(400, 'Unsupported agent wire version: expected v 1.');
        if (typeof body.providerId !== 'string' || typeof body.messageId !== 'string' || !Array.isArray(body.request?.messages)) {
            return jsonError(400, 'Body must be { v: 1, providerId, messageId, request: { messages } }.');
        }
        const provider = Object.hasOwn(options.providers, body.providerId) ? options.providers[body.providerId] : undefined;
        if (!provider) {
            return jsonError(400, `Unknown providerId "${body.providerId}". Register it in the handler's providers map.`);
        }

        const clientTools = Array.isArray(body.clientTools) ? body.clientTools : [];
        for (const t of clientTools) {
            if (typeof t?.name !== 'string') return jsonError(400, 'A browser tool needs a name.');
            if (options.clientTools === false) return jsonError(400, 'This endpoint accepts no browser tools.');
            if (tools.has(t.name)) return jsonError(400, `Browser tool "${t.name}" has the name of a server tool.`);
            if (Array.isArray(options.clientTools) && !options.clientTools.includes(t.name)) {
                return jsonError(400, `Browser tool "${t.name}" is not allowed here.`);
            }
        }

        let outcomes: Record<string, StreamDeferredOutcome> = {};
        if (body.resume) {
            const payload = typeof body.resume.ticket === 'string'
                ? await verifyTicket(body.resume.ticket, secrets, subtle, maxAge)
                : null;
            // A ticket answers the message it was signed for, and nothing else.
            if (!payload || payload.messageId !== body.messageId) {
                return jsonError(400, 'Invalid or expired continuation ticket.');
            }
            const tail = unansweredTail(body.request.messages as StreamChatRequest['messages']);
            if (!sameCalls(payload.calls, tail.map((c) => ({ id: c.id, name: c.name, input: c.input })))) {
                return jsonError(400, 'The pending tool calls do not match the ticket.');
            }
            const ids = new Set(payload.calls.map((c) => c.id));
            const given = body.resume.outcomes && typeof body.resume.outcomes === 'object' ? body.resume.outcomes : {};
            for (const id of Object.keys(given)) {
                if (!ids.has(id)) return jsonError(400, `No pending call "${id}" in the ticket.`);
            }
            if (options.onTicket && !(await options.onTicket(body.resume.ticket.split('.')[1]!))) {
                return jsonError(409, 'This continuation ticket was already used.');
            }
            outcomes = withoutUnacceptedPayloads(given, payload.calls, tools);
        }

        let request: AparteChatRequest = {
            ...body.request,
            tools: [...[...tools.values()].map((t) => t.tool), ...clientTools],
        };
        if (options.prepareRequest) request = await options.prepareRequest(request, req);
        const key = await options.resolveKey?.(body.providerId);
        const external = new Set(clientTools.map((t) => t.name));
        const rule = (call: AparteToolCall) => options.approvalPolicy?.(call, tools.get(call.name)?.tool);

        const run = new AbortController();
        if (req.signal.aborted) run.abort();
        else req.signal.addEventListener('abort', () => run.abort(), { once: true });
        const encoder = new TextEncoder();
        // The one asynchronous write — signing a suspension. `run-suspended` is a run's
        // last event, so awaiting this single promise before closing is enough.
        let pendingWrite: Promise<void> | undefined;

        const stream = new ReadableStream<Uint8Array>({
            start(controller) {
                let open = true;
                const write = (line: object): void => {
                    if (!open) return;
                    try { controller.enqueue(encoder.encode(JSON.stringify(line) + '\n')); } catch { open = false; }
                };
                const close = (): void => {
                    if (!open) return;
                    open = false;
                    try { controller.close(); } catch { /* already closed by a cancel */ }
                };
                const emitter = (event: StreamRunEvent): void => {
                    if (event.type !== 'run-suspended') {
                        write(event);
                        return;
                    }
                    const calls: AparteTicketCall[] = event.pending.map((p) => ({ id: p.toolCallId, name: p.name, input: p.input }));
                    pendingWrite = signTicket({ v: 1, iat: Date.now(), messageId: body.messageId, calls }, secrets[0]!, subtle)
                        .then((ticket) => write({ ...event, ticket }));
                };
                void runStreamAgent({
                    messageId: body.messageId,
                    providerId: body.providerId,
                    baseRequest: request as StreamChatRequest,
                    transportCall: async (r) => {
                        const response = await transport.chat(provider, r as AparteChatRequest, key, { providerId: body.providerId, signal: run.signal });
                        return typeof response === 'string'
                            ? response
                            : readableToAsyncIterable(response as ReadableStream<AparteStreamEvent>, run.signal);
                    },
                    toolLookup: (name) => {
                        const t = tools.get(name);
                        return t ? (call, signal) => t.handler(call as AparteToolCall, signal, {}) : undefined;
                    },
                    toolConfigLookup: (name) => {
                        if (external.has(name)) return { external: true };
                        const t = tools.get(name);
                        if (!t) return undefined;
                        return {
                            ...(t.tool.maxTurns !== undefined ? { maxTurns: t.tool.maxTurns } : {}),
                            needsApproval: (call) => {
                                const ruling = rule(call as AparteToolCall);
                                if (ruling?.verdict === 'allow') return false;
                                if (ruling?.verdict) return ruling.verdict;
                                return Boolean(t.tool.needsApproval);
                            },
                        };
                    },
                    // Reached only for a server `deny`: an `ask` is deferred to the page.
                    approvalResolver: async (call) => ({
                        approved: false,
                        reason: rule(call as AparteToolCall)?.reason?.trim() || 'Tool execution was refused by the server policy.',
                    }),
                    deferral: { outcomes },
                    emitter,
                    signal: run.signal,
                    ...(options.maxTurns !== undefined ? { maxTurns: options.maxTurns } : {}),
                    ...(options.toolTimeoutMs !== undefined ? { toolTimeoutMs: options.toolTimeoutMs } : {}),
                }).then(async () => {
                    await pendingWrite;
                    close();
                }, async (error: unknown) => {
                    // The vendor's words stay here: they can carry a key, a URL, an account.
                    console.error('[aparte] agent run failed', error);
                    await pendingWrite?.catch(() => {});
                    write({
                        type: 'run-error',
                        message: 'The agent run failed.',
                        code: error instanceof AparteError ? error.code : 'AGENT_RUN_FAILED',
                    });
                    close();
                });
            },
            cancel() {
                run.abort();
            },
        });

        return new Response(stream, { headers: { 'Content-Type': 'application/x-ndjson' } });
    };
}

/** A decision's `payload` rewrites the tool's input; only a tool that says so accepts one from a browser. */
function withoutUnacceptedPayloads(
    outcomes: Record<string, StreamDeferredOutcome>,
    calls: readonly AparteTicketCall[],
    tools: ReadonlyMap<string, AparteAgentTool>,
): Record<string, StreamDeferredOutcome> {
    const out: Record<string, StreamDeferredOutcome> = {};
    for (const [id, outcome] of Object.entries(outcomes)) {
        const name = calls.find((c) => c.id === id)?.name;
        if (outcome?.kind === 'decision' && outcome.payload !== undefined && !(name && tools.get(name)?.acceptsApprovalPayload)) {
            const { payload: _dropped, ...rest } = outcome;
            out[id] = rest;
        } else {
            out[id] = outcome;
        }
    }
    return out;
}

function jsonError(status: number, message: string): Response {
    return new Response(JSON.stringify({ error: { message } }), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });
}
