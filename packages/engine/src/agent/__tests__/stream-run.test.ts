import { describe, it, expect, vi } from 'vitest';
import { runStreamAgent, type StreamRunOptions } from '../stream-run';
import type {
    StreamChatEvent,
    StreamRunEvent,
    StreamChatRequest,
    StreamToolHandler,
    StreamAgentMessage,
} from '../stream-events';

// ─── harness (mirrors agent-loop.test.ts scripted()/recorder()) ──────────────
// Pure Node: no jsdom, no @aparte/core, no DOM. Proves the loop is headless.

async function* streamOf(events: StreamChatEvent[]): AsyncIterable<StreamChatEvent> {
    for (const e of events) yield e;
}

/** A transport replaying one scripted stream per call, capturing each request. */
function scriptedTransport(streams: StreamChatEvent[][]): {
    calls: StreamChatRequest[];
    transportCall: StreamRunOptions['transportCall'];
} {
    const calls: StreamChatRequest[] = [];
    let i = 0;
    return {
        calls,
        // Snapshot the request — the loop mutates `messages` across turns.
        transportCall: async (request) => {
            calls.push({ ...request, messages: request.messages.map(m => ({ ...m })) });
            return streamOf(streams[i++] ?? []);
        },
    };
}

function recorder(): { events: StreamRunEvent[]; emitter: (e: StreamRunEvent) => void; types: () => string[] } {
    const events: StreamRunEvent[] = [];
    return { events, emitter: (e) => events.push(e), types: () => events.map(e => e.type) };
}

function baseOpts(over: Partial<StreamRunOptions>): StreamRunOptions {
    return {
        messageId: 'm1',
        baseRequest: { modelId: 'm', messages: [{ role: 'user', content: 'hi' }] },
        transportCall: async () => streamOf([{ type: 'done' }]),
        toolLookup: () => undefined,
        emitter: () => { /* no-op */ },
        signal: new AbortController().signal,
        ...over,
    };
}

describe('runStreamAgent — text & lifecycle', () => {
    it('emits text-delta(s) then run-done for a plain text turn', async () => {
        const t = scriptedTransport([[
            { type: 'text', delta: 'Hel' },
            { type: 'text', delta: 'lo' },
            { type: 'done', usage: { inputTokens: 5, outputTokens: 2 } },
        ]]);
        const rec = recorder();
        const usage = await runStreamAgent(baseOpts({ transportCall: t.transportCall, emitter: rec.emitter }));

        expect(rec.types()).toEqual(['run-start', 'turn-start', 'text-delta', 'text-delta', 'text-flush', 'run-done']);
        expect(usage).toEqual({ inputTokens: 5, outputTokens: 2 });
        expect(t.calls).toHaveLength(1);
    });

    it('emits run-done with the last-turn usage (last-write-wins) across tool turns', async () => {
        const t = scriptedTransport([
            [{ type: 'tool_use', id: 'c1', name: 'x', input: {} }, { type: 'done', usage: { inputTokens: 1, outputTokens: 1 } }],
            [{ type: 'text', delta: 'end' }, { type: 'done', usage: { inputTokens: 9, outputTokens: 9 } }],
        ]);
        const rec = recorder();
        const usage = await runStreamAgent(baseOpts({
            transportCall: t.transportCall, emitter: rec.emitter,
            toolLookup: () => async () => ({ content: 'r' }),
        }));
        expect(usage).toEqual({ inputTokens: 9, outputTokens: 9 });
    });

    it('forwards a non-streaming string response and FLUSHES the parser', async () => {
        const rec = recorder();
        await runStreamAgent(baseOpts({ transportCall: async () => 'plain answer', emitter: rec.emitter }));
        // `text-flush` is the adapter's only caller of `parser.finalize()`. This
        // assertion used to omit it, and so encoded the bug: a non-streaming reply
        // ending on an ambiguous tail — a backtick, a `<`, the safe window inside
        // an unterminated fence — lost it, and one made only of those rendered
        // nothing at all.
        expect(rec.events).toEqual([
            { type: 'run-start' },
            { type: 'text-delta', delta: 'plain answer' },
            { type: 'text-flush' },
            { type: 'run-done', usage: undefined },
        ]);
    });

    it('a non-streaming reply that is ONLY an ambiguous tail still renders', async () => {
        const rec = recorder();
        await runStreamAgent(baseOpts({ transportCall: async () => '```', emitter: rec.emitter }));
        expect(rec.events, 'the parser withholds "```" until it is flushed').toEqual([
            { type: 'run-start' },
            { type: 'text-delta', delta: '```' },
            { type: 'text-flush' },
            { type: 'run-done', usage: undefined },
        ]);
    });
});

describe('runStreamAgent — tools & HITL', () => {
    it('runs an approved needsApproval tool, feeds the result back, then finishes', async () => {
        const t = scriptedTransport([
            [{ type: 'text', delta: 'Let me check.' }, { type: 'tool_use', id: 'c1', name: 'search', input: { q: 'x' } }, { type: 'done' }],
            [{ type: 'text', delta: 'Found it.' }, { type: 'done', usage: { inputTokens: 9, outputTokens: 3 } }],
        ]);
        const rec = recorder();
        const handler = vi.fn<StreamToolHandler>(async () => ({ content: 'RESULT' }));
        const usage = await runStreamAgent(baseOpts({
            transportCall: t.transportCall, emitter: rec.emitter,
            toolLookup: (n) => (n === 'search' ? handler : undefined),
            toolConfigLookup: (n) => (n === 'search' ? { needsApproval: true } : undefined),
            approvalResolver: async () => ({ approved: true }),
        }));

        expect(rec.types()).toEqual([
            'run-start',
            'turn-start', 'text-delta', 'tool-start', 'tool-awaiting-approval', 'tool-approved', 'tool-resolved', 'text-flush',
            'turn-start', 'text-delta', 'text-flush',
            'run-done',
        ]);
        // The 2nd transport call sees the enriched history.
        const second = t.calls[1]!.messages;
        const toolCallMsg = second.find(m => m.role === 'tool_call');
        expect(toolCallMsg?.toolCalls?.[0]?.id).toBe('c1');
        expect(toolCallMsg?.precedingText).toBe('Let me check.');
        expect(second.some(m => m.role === 'tool_result' && m.content === 'RESULT' && m.toolCallId === 'c1')).toBe(true);
        expect(handler).toHaveBeenCalledOnce();
        expect(usage).toEqual({ inputTokens: 9, outputTokens: 3 });
    });

    it('runs a tool with no preceding text (precedingText undefined)', async () => {
        const t = scriptedTransport([
            [{ type: 'tool_use', id: 'c1', name: 'x', input: {} }, { type: 'done' }],
            [{ type: 'text', delta: 'ok' }, { type: 'done' }],
        ]);
        await runStreamAgent(baseOpts({
            transportCall: t.transportCall,
            toolLookup: () => async () => ({ content: 'r' }),
        }));
        const toolCallMsg = t.calls[1]!.messages.find(m => m.role === 'tool_call');
        expect(toolCallMsg?.precedingText).toBeUndefined();
    });

    it('merges an object approval payload into the tool input', async () => {
        const t = scriptedTransport([
            [{ type: 'tool_use', id: 'c1', name: 'edit', input: { path: '/a', mode: 'r' } }, { type: 'done' }],
            [{ type: 'done' }],
        ]);
        let received: unknown;
        const handler: StreamToolHandler = async (call) => { received = call.input; return { content: 'ok' }; };
        await runStreamAgent(baseOpts({
            transportCall: t.transportCall,
            toolLookup: () => handler,
            toolConfigLookup: () => ({ needsApproval: true }),
            approvalResolver: async () => ({ approved: true, payload: { mode: 'w', extra: 1 } }),
        }));
        expect(received).toEqual({ path: '/a', mode: 'w', extra: 1 });
    });

    /*
     * A refusal answers two questions differently, which is why one flag could not
     * carry it: it ends this turn's REMAINING calls, and it hands the model a turn.
     *
     * This asserted the opposite until now — "stops on rejection", one transport call.
     * The turn simply ended, so the "rejected by the user" tool_result appended just
     * above was never sent to anybody, and telling the assistant what you actually
     * wanted meant retyping it as a new message it then read out of order.
     */
    it('a refusal ends the turn and hands the model a turn to answer in', async () => {
        const t = scriptedTransport([
            [
                { type: 'tool_use', id: 'c1', name: 'danger', input: {} },
                // A second call in the SAME turn. Refusing the first must not license it.
                { type: 'tool_use', id: 'c2', name: 'also-danger', input: {} },
                { type: 'done' },
            ],
            [{ type: 'text', delta: 'Understood, I will not.' }, { type: 'done' }],
        ]);
        const rec = recorder();
        const handler = vi.fn<StreamToolHandler>(async () => ({ content: 'nope' }));
        await runStreamAgent(baseOpts({
            transportCall: t.transportCall, emitter: rec.emitter,
            toolLookup: () => handler,
            toolConfigLookup: () => ({ needsApproval: true }),
            approvalResolver: async () => ({ approved: false }),
        }));

        expect(rec.types()).toEqual([
            'run-start',
            'turn-start', 'tool-start', 'tool-awaiting-approval', 'tool-rejected', 'text-flush',
            'turn-start', 'text-delta', 'text-flush',
            'run-done',
        ]);
        // No `tool-start` for c2: the refusal ended the turn's remaining calls.
        expect(rec.types().filter(t2 => t2 === 'tool-start')).toHaveLength(1);
        expect(handler, 'neither tool runs').not.toHaveBeenCalled();

        // And the refusal actually reached the model, which is the whole point.
        expect(t.calls).toHaveLength(2);
        expect(t.calls[1]!.messages.some(
            m => m.role === 'tool_result' && typeof m.content === 'string'
                && m.content.includes('rejected by the user'),
        ), 'the second turn carries the refusal').toBe(true);
    });

    /*
     * A stop is not a refusal, and a missing resolver is not one either.
     *
     * Both used to land on `{ approved: false }` — the abort because that is what the
     * caller's resolver resolves when the signal fires, the missing resolver because
     * the default WAS `async () => ({ approved: false })`. So the loop took the refusal
     * branch and appended "Tool execution was rejected by the user." to the history: a
     * sentence naming a decision nobody made, in the one place the model reads.
     *
     * The assertions are on the invariant rather than the exact event sequence, so that
     * moving WHERE the gate is announced does not have to rewrite them.
     */
    it('an abort while awaiting approval is not reported as a rejection', async () => {
        const t = scriptedTransport([[{ type: 'tool_use', id: 'c1', name: 'danger', input: {} }, { type: 'done' }]]);
        const rec = recorder();
        const handler = vi.fn<StreamToolHandler>(async () => ({ content: 'nope' }));
        const ac = new AbortController();
        await runStreamAgent(baseOpts({
            transportCall: t.transportCall, emitter: rec.emitter, signal: ac.signal,
            toolLookup: () => handler,
            toolConfigLookup: () => ({ needsApproval: true }),
            // The human presses Stop instead of deciding, which is exactly what core's
            // built-in channel does: it resolves `{ approved: false }` on abort.
            approvalResolver: async () => { ac.abort(); return { approved: false }; },
        }));
        expect(rec.types(), 'a stopped wait is aborted').toContain('tool-aborted');
        expect(rec.types(), 'and never rejected').not.toContain('tool-rejected');
        expect(handler).not.toHaveBeenCalled();
    });

    it('a needsApproval tool with no resolver aborts rather than inventing a refusal', async () => {
        const t = scriptedTransport([[{ type: 'tool_use', id: 'c1', name: 'danger', input: {} }, { type: 'done' }]]);
        const rec = recorder();
        const handler = vi.fn<StreamToolHandler>(async () => ({ content: 'nope' }));
        await runStreamAgent(baseOpts({
            transportCall: t.transportCall, emitter: rec.emitter,
            toolLookup: () => handler,
            toolConfigLookup: () => ({ needsApproval: true }),
            // No `approvalResolver`: nothing can ask, so nothing may answer.
            }));
        expect(rec.types(), 'nobody could be asked, so the wait is aborted').toContain('tool-aborted');
        expect(rec.types(), 'a host that forgot a resolver has not refused anything').not.toContain('tool-rejected');
        expect(handler).not.toHaveBeenCalled();
    });

    it('aborts the tool and stops when no handler is registered', async () => {
        const t = scriptedTransport([[{ type: 'tool_use', id: 'c1', name: 'ghost', input: {} }, { type: 'done' }]]);
        const rec = recorder();
        await runStreamAgent(baseOpts({ transportCall: t.transportCall, emitter: rec.emitter, toolLookup: () => undefined }));
        expect(rec.types()).toEqual(['run-start', 'turn-start', 'tool-start', 'tool-aborted', 'text-flush', 'run-done']);
    });

    it('runs a non-approval tool directly (no awaiting-approval event)', async () => {
        const t = scriptedTransport([
            [{ type: 'tool_use', id: 'c1', name: 'x', input: {} }, { type: 'done' }],
            [{ type: 'text', delta: 'done' }, { type: 'done' }],
        ]);
        const rec = recorder();
        await runStreamAgent(baseOpts({
            transportCall: t.transportCall, emitter: rec.emitter,
            toolLookup: () => async () => ({ content: 'r' }),
        }));
        expect(rec.types()).toEqual([
            'run-start',
            'turn-start', 'tool-start', 'tool-resolved', 'text-flush',
            'turn-start', 'text-delta', 'text-flush',
            'run-done',
        ]);
    });
});

describe('runStreamAgent — limits, abort & error', () => {
    it('stops with a tool-scoped turn-limit when a tool maxTurns is reached', async () => {
        const t = scriptedTransport([
            [{ type: 'tool_use', id: 'c1', name: 'loop', input: {} }, { type: 'done' }],
            [{ type: 'tool_use', id: 'c2', name: 'loop', input: {} }, { type: 'done' }],
        ]);
        const rec = recorder();
        await runStreamAgent(baseOpts({
            transportCall: t.transportCall, emitter: rec.emitter,
            toolLookup: () => async () => ({ content: 'again' }),
            toolConfigLookup: () => ({ maxTurns: 2 }),
            maxTurns: 10,
        }));
        expect(rec.events.find(e => e.type === 'turn-limit-exceeded')).toMatchObject({ scope: 'tool', limit: 2, toolCallId: 'c2' });
    });

    it('stops with a global turn-limit when maxTurns is exceeded', async () => {
        const t = scriptedTransport([
            [{ type: 'tool_use', id: 'c1', name: 'loop', input: {} }, { type: 'done' }],
            [{ type: 'tool_use', id: 'c2', name: 'loop', input: {} }, { type: 'done' }],
        ]);
        const rec = recorder();
        await runStreamAgent(baseOpts({
            transportCall: t.transportCall, emitter: rec.emitter,
            toolLookup: () => async () => ({ content: 'again' }),
            toolConfigLookup: () => ({ maxTurns: 100 }),
            maxTurns: 2,
        }));
        expect(rec.events.find(e => e.type === 'turn-limit-exceeded')).toMatchObject({ scope: 'global', limit: 2 });
        expect(t.calls).toHaveLength(2); // turn 3 breaks before the transport call
    });

    it('emits run-aborted then run-done when the signal is already aborted', async () => {
        const rec = recorder();
        await runStreamAgent(baseOpts({ emitter: rec.emitter, signal: AbortSignal.abort() }));
        // Abort at the outer-loop top breaks before turn-start/transport.
        expect(rec.types()).toEqual(['run-start', 'run-aborted', 'run-done']);
    });

    it('cancels mid-stream on abort (checked before the next read) and still finalizes', async () => {
        const ctrl = new AbortController();
        const events: StreamRunEvent[] = [];
        // Abort synchronously right after the first text-delta is emitted, so the
        // loop sees it at the top of the next iteration (before reading 'b').
        const emitter = (e: StreamRunEvent) => {
            events.push(e);
            if (e.type === 'text-delta') ctrl.abort();
        };
        await runStreamAgent(baseOpts({
            transportCall: async () => streamOf([{ type: 'text', delta: 'a' }, { type: 'text', delta: 'b' }]),
            emitter, signal: ctrl.signal,
        }));
        // 'b' is never read; text-flush still runs on the abort-break (like finalize()).
        expect(events.map(e => e.type)).toEqual(['run-start', 'turn-start', 'text-delta', 'run-aborted', 'text-flush', 'run-done']);
    });

    it('throws on a stream error event without emitting run-done (caller handles it)', async () => {
        const t = scriptedTransport([[{ type: 'text', delta: 'x' }, { type: 'error', message: 'boom' }]]);
        const rec = recorder();
        await expect(
            runStreamAgent(baseOpts({ transportCall: t.transportCall, emitter: rec.emitter })),
        ).rejects.toThrow('boom');
        // The throw escapes before text-flush and run-done (like _streamLoop).
        expect(rec.types()).toEqual(['run-start', 'turn-start', 'text-delta']);
    });
});

describe('runStreamAgent — create_artifact built-in', () => {
    it('bypasses the tool path (one-shot artifact-ready + success tool_result)', async () => {
        const t = scriptedTransport([
            [{ type: 'tool_use', id: 'c1', name: 'create_artifact', input: { mimeType: 'text/html', title: 'Page', content: '<h1>Hi</h1>' } }, { type: 'done' }],
            [{ type: 'text', delta: 'Made it.' }, { type: 'done' }],
        ]);
        const rec = recorder();
        await runStreamAgent(baseOpts({ transportCall: t.transportCall, emitter: rec.emitter }));

        expect(rec.types()).not.toContain('tool-start');
        expect(rec.events.find(e => e.type === 'artifact-ready')).toEqual({
            type: 'artifact-ready', id: 'artifact-c1', mimeType: 'text/html', kind: 'html', title: 'Page', content: '<h1>Hi</h1>',
        });
        const second = t.calls[1]!.messages;
        expect(second.some(m => m.role === 'tool_result' && m.content === 'Artifact created successfully.' && m.toolCallId === 'c1')).toBe(true);
        expect(second.some(m => m.role === 'tool_call' && m.toolCalls?.[0]?.id === 'c1')).toBe(true);
    });

    it('defaults mimeType/title/content when the input omits them', async () => {
        const t = scriptedTransport([
            [{ type: 'tool_use', id: 'c9', name: 'create_artifact', input: {} }, { type: 'done' }],
            [{ type: 'done' }],
        ]);
        const rec = recorder();
        await runStreamAgent(baseOpts({ transportCall: t.transportCall, emitter: rec.emitter }));
        expect(rec.events.find(e => e.type === 'artifact-ready')).toEqual({
            type: 'artifact-ready', id: 'artifact-c9', mimeType: 'text/plain', kind: 'text', title: 'text', content: '',
        });
    });
});

describe('runStreamAgent — synthetic toolChoice bypass', () => {
    it('runs the forced tool on turn 1 (no LLM call), then answers with the result in history', async () => {
        // One transport call only: the synthetic handler runs pre-transport, then
        // the SAME turn calls the LLM with toolChoice stripped to get the reply.
        const t = scriptedTransport([[{ type: 'text', delta: 'Saved.' }, { type: 'done' }]]);
        const rec = recorder();
        const handler = vi.fn<StreamToolHandler>(async () => ({ content: 'SAVED' }));
        await runStreamAgent(baseOpts({
            transportCall: t.transportCall, emitter: rec.emitter,
            baseRequest: { modelId: 'm', messages: [{ role: 'user', content: 'hi' }], toolChoice: { name: 'save', input: { x: 1 } } },
            toolLookup: (n) => (n === 'save' ? handler : undefined),
            idGen: (p) => `${p}-0`,
        }));

        // Synthetic tool events come before the turn's own stream (turn-start).
        expect(rec.types()).toEqual([
            'run-start', 'tool-start', 'tool-resolved',
            'turn-start', 'text-delta', 'text-flush', 'run-done',
        ]);
        expect(handler).toHaveBeenCalledOnce();
        expect((handler.mock.calls[0]![0]).input).toEqual({ x: 1 });
        // Exactly one transport call, with the synthetic result in history and
        // toolChoice/tools stripped so the model just answers.
        expect(t.calls).toHaveLength(1);
        expect(t.calls[0]!['toolChoice']).toBe('none');
        expect(t.calls[0]!['tools']).toBeUndefined();
        const msgs = t.calls[0]!.messages;
        expect(msgs.some(m => m.role === 'tool_call' && m.toolCalls?.[0]?.id === 'synthetic-tool-0')).toBe(true);
        expect(msgs.some(m => m.role === 'tool_result' && m.content === 'SAVED' && m.toolCallId === 'synthetic-tool-0')).toBe(true);
    });

    it('aborts the synthetic tool and stops when no handler is registered (no transport call)', async () => {
        const t = scriptedTransport([[{ type: 'text', delta: 'unused' }, { type: 'done' }]]);
        const rec = recorder();
        await runStreamAgent(baseOpts({
            transportCall: t.transportCall, emitter: rec.emitter,
            baseRequest: { modelId: 'm', messages: [{ role: 'user', content: 'hi' }], toolChoice: { name: 'ghost', input: {} } },
            toolLookup: () => undefined,
            idGen: (p) => `${p}-0`,
        }));
        expect(rec.types()).toEqual(['run-start', 'tool-start', 'tool-aborted', 'run-done']);
        expect(t.calls).toHaveLength(0);
    });

    it('aborts the synthetic tool when the handler throws AbortError', async () => {
        const t = scriptedTransport([[{ type: 'done' }]]);
        const rec = recorder();
        await runStreamAgent(baseOpts({
            transportCall: t.transportCall, emitter: rec.emitter,
            baseRequest: { modelId: 'm', messages: [{ role: 'user', content: 'hi' }], toolChoice: { name: 'slow', input: {} } },
            toolLookup: () => async () => { const e = new Error('x'); e.name = 'AbortError'; throw e; },
            idGen: (p) => `${p}-0`,
        }));
        expect(rec.types()).toEqual(['run-start', 'tool-start', 'tool-aborted', 'run-done']);
        expect(t.calls).toHaveLength(0);
    });

    it('propagates a non-abort synthetic-tool handler failure to the caller (never resolves it)', async () => {
        const t = scriptedTransport([[{ type: 'done' }]]);
        const rec = recorder();
        // A consumer handler that throws for a NON-abort reason (a bug, a failed
        // fetch) must surface to the caller — mirroring _streamLoop → _handleSend's
        // catch — not be silently turned into a tool result.
        await expect(runStreamAgent(baseOpts({
            transportCall: t.transportCall, emitter: rec.emitter,
            baseRequest: { modelId: 'm', messages: [{ role: 'user', content: 'hi' }], toolChoice: { name: 'save', input: {} } },
            toolLookup: () => async () => { throw new Error('handler boom'); },
            idGen: (p) => `${p}-0`,
        }))).rejects.toThrow('handler boom');
        expect(rec.types()).toContain('tool-start');
        expect(rec.types()).not.toContain('tool-resolved');
    });

    it('propagates a non-abort handler failure from a streamed tool_use to the caller', async () => {
        const t = scriptedTransport([[
            { type: 'tool_use', id: 'c1', name: 'save', input: {} },
            { type: 'done' },
        ]]);
        const rec = recorder();
        await expect(runStreamAgent(baseOpts({
            transportCall: t.transportCall, emitter: rec.emitter,
            toolLookup: () => async () => { throw new Error('handler boom'); },
        }))).rejects.toThrow('handler boom');
        expect(rec.types()).not.toContain('tool-resolved');
        expect(rec.types()).not.toContain('run-done');
    });

    it('does NOT trigger on a plain (non-object) toolChoice like "auto"', async () => {
        const t = scriptedTransport([[{ type: 'text', delta: 'hello' }, { type: 'done' }]]);
        const rec = recorder();
        await runStreamAgent(baseOpts({
            transportCall: t.transportCall, emitter: rec.emitter,
            baseRequest: { modelId: 'm', messages: [{ role: 'user', content: 'hi' }], toolChoice: 'auto' },
        }));
        // No synthetic bypass: a normal single text turn.
        expect(rec.types()).toEqual(['run-start', 'turn-start', 'text-delta', 'text-flush', 'run-done']);
        expect(t.calls).toHaveLength(1);
    });
});

describe('runStreamAgent — onHistoryAppend (the caller can own the history)', () => {
    // The loop keeps its own `messages` array and re-sends it every turn. A host
    // with a prefix cache (llama.cpp slots, vLLM) needs the opposite: an
    // append-only prompt whose turn N+1 EXTENDS turn N byte for byte. It can
    // already build its own request in `transportCall` — what it could not do was
    // learn which turns the loop appended without reimplementing the loop's
    // tool_call/tool_result bookkeeping. This hook is that missing half.

    it('notifies the tool_call envelope then the tool_result, before the next turn goes out', async () => {
        const t = scriptedTransport([
            [
                { type: 'text', delta: 'let me look' },
                { type: 'tool_use', id: 'c1', name: 'search', input: { q: 'x' } },
                { type: 'done' },
            ],
            [{ type: 'text', delta: 'found it' }, { type: 'done' }],
        ]);
        // Interleave the two channels so ordering is observable, not just contents.
        const log: string[] = [];
        const appended: StreamAgentMessage[] = [];
        const transportCall: StreamRunOptions['transportCall'] = (request) => {
            log.push('call');
            return t.transportCall(request);
        };

        await runStreamAgent(baseOpts({
            transportCall,
            toolLookup: () => async () => ({ content: 'result text' }),
            onHistoryAppend: (m) => { log.push(`append:${m.role}`); appended.push(m); },
        }));

        expect(log).toEqual(['call', 'append:tool_call', 'append:tool_result', 'call']);
        expect(appended[0]).toEqual({
            role: 'tool_call',
            content: '',
            toolCalls: [{ id: 'c1', name: 'search', input: { q: 'x' } }],
            precedingText: 'let me look',
        });
        expect(appended[1]).toEqual({ role: 'tool_result', content: 'result text', toolCallId: 'c1' });
    });

    it('never notifies the caller of its own baseRequest messages', async () => {
        const appended: StreamAgentMessage[] = [];
        await runStreamAgent(baseOpts({
            baseRequest: { modelId: 'm', messages: [{ role: 'system', content: 'sys' }, { role: 'user', content: 'hi' }] },
            transportCall: async () => streamOf([{ type: 'text', delta: 'yo' }, { type: 'done' }]),
            onHistoryAppend: (m) => appended.push(m),
        }));
        expect(appended).toEqual([]);
    });

    it('reproduces the loop\'s own history from the notifications alone', async () => {
        // The consumer's scenario: ignore `request.messages`, rebuild from the hook.
        const t = scriptedTransport([
            [{ type: 'tool_use', id: 'c1', name: 'a', input: {} }, { type: 'done' }],
            [{ type: 'tool_use', id: 'c2', name: 'b', input: {} }, { type: 'done' }],
            [{ type: 'text', delta: 'done' }, { type: 'done' }],
        ]);
        const mine: StreamAgentMessage[] = [{ role: 'user', content: 'hi' }];
        await runStreamAgent(baseOpts({
            transportCall: t.transportCall,
            toolLookup: (name) => async () => ({ content: `r-${name}` }),
            onHistoryAppend: (m) => mine.push(m),
        }));
        // Last turn's request is the loop's full history — ours must match it.
        expect(mine).toEqual(t.calls.at(-1)!.messages);
    });

    it('notifies a rejected tool call too', async () => {
        const rejected: StreamAgentMessage[] = [];
        // A SCRIPTED transport, not one stream repeated: a refusal now takes another
        // turn, and a transport that replays the same tool_use for ever would be
        // refused again on every turn up to `maxTurns`.
        const t = scriptedTransport([
            [{ type: 'tool_use', id: 'c1', name: 'rm', input: {} }, { type: 'done' }],
            [{ type: 'done' }],
        ]);
        await runStreamAgent(baseOpts({
            transportCall: t.transportCall,
            toolLookup: () => async () => ({ content: 'never runs' }),
            toolConfigLookup: () => ({ needsApproval: true }),
            approvalResolver: async () => ({ approved: false }),
            onHistoryAppend: (m) => rejected.push(m),
        }));
        expect(rejected.map(m => m.role)).toEqual(['tool_call', 'tool_result']);
        expect(rejected[1]!.content).toContain('rejected by the user');
    });

    it('changes nothing when it is not supplied', async () => {
        // Non-regression guard for the 1.0 story: same events, same history, hook
        // or no hook. The suites above assert the no-hook behaviour in detail; this
        // pins that adding the hook did not perturb it.
        const withHook = scriptedTransport([
            [{ type: 'tool_use', id: 'c1', name: 'a', input: {} }, { type: 'done' }],
            [{ type: 'text', delta: 'end' }, { type: 'done' }],
        ]);
        const without = scriptedTransport([
            [{ type: 'tool_use', id: 'c1', name: 'a', input: {} }, { type: 'done' }],
            [{ type: 'text', delta: 'end' }, { type: 'done' }],
        ]);
        const recA = recorder();
        const recB = recorder();
        await runStreamAgent(baseOpts({
            transportCall: withHook.transportCall, emitter: recA.emitter,
            toolLookup: () => async () => ({ content: 'r' }),
            onHistoryAppend: () => { /* observing only */ },
        }));
        await runStreamAgent(baseOpts({
            transportCall: without.transportCall, emitter: recB.emitter,
            toolLookup: () => async () => ({ content: 'r' }),
        }));
        expect(recA.events).toEqual(recB.events);
        expect(withHook.calls).toEqual(without.calls);
    });
});
