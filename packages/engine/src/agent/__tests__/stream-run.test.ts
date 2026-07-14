import { describe, it, expect, vi } from 'vitest';
import { runStreamAgent, type StreamRunOptions } from '../stream-run';
import type {
    StreamChatEvent,
    StreamRunEvent,
    StreamChatRequest,
    StreamToolHandler,
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
        baseRequest: { messages: [{ role: 'user', content: 'hi' }] },
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

    it('forwards a non-streaming string response as a single text-delta', async () => {
        const rec = recorder();
        await runStreamAgent(baseOpts({ transportCall: async () => 'plain answer', emitter: rec.emitter }));
        expect(rec.events).toEqual([
            { type: 'run-start' },
            { type: 'text-delta', delta: 'plain answer' },
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

    it('stops on rejection and records a tool_result rejection (no re-call, no handler run)', async () => {
        const t = scriptedTransport([[{ type: 'tool_use', id: 'c1', name: 'danger', input: {} }, { type: 'done' }]]);
        const rec = recorder();
        const handler = vi.fn<StreamToolHandler>(async () => ({ content: 'nope' }));
        await runStreamAgent(baseOpts({
            transportCall: t.transportCall, emitter: rec.emitter,
            toolLookup: () => handler,
            toolConfigLookup: () => ({ needsApproval: true }),
            approvalResolver: async () => ({ approved: false }),
        }));
        expect(rec.types()).toEqual(['run-start', 'turn-start', 'tool-start', 'tool-awaiting-approval', 'tool-rejected', 'text-flush', 'run-done']);
        expect(handler).not.toHaveBeenCalled();
        expect(t.calls).toHaveLength(1);
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

describe('runStreamAgent — artifactRaw mode', () => {
    it('routes the whole turn text into one artifact segment', async () => {
        const t = scriptedTransport([[
            { type: 'text', delta: 'const ' },
            { type: 'text', delta: 'x = 1;' },
            { type: 'done', usage: { inputTokens: 3, outputTokens: 4 } },
        ]]);
        const rec = recorder();
        const usage = await runStreamAgent(baseOpts({
            transportCall: t.transportCall, emitter: rec.emitter,
            baseRequest: { messages: [{ role: 'user', content: 'hi' }], _meta: { artifactRaw: { mimeType: 'text/javascript', kind: 'js' } } },
            idGen: (p) => `${p}-0`,
        }));
        expect(rec.events).toEqual([
            { type: 'run-start' },
            { type: 'turn-start' },
            { type: 'artifact-open', id: 'artifact-raw-0', mimeType: 'text/javascript', kind: 'js', title: 'js' },
            { type: 'artifact-chunk', id: 'artifact-raw-0', content: 'const ' },
            { type: 'artifact-chunk', id: 'artifact-raw-0', content: 'const x = 1;' },
            { type: 'text-flush' },
            { type: 'artifact-close', id: 'artifact-raw-0', content: 'const x = 1;', inline: true },
            { type: 'run-done', usage: { inputTokens: 3, outputTokens: 4 } },
        ]);
        expect(usage).toEqual({ inputTokens: 3, outputTokens: 4 });
    });

    it('marks a >=15-line raw artifact as not inline', async () => {
        const body = Array.from({ length: 20 }, (_, i) => `line ${i}`).join('\n');
        const t = scriptedTransport([[{ type: 'text', delta: body }, { type: 'done' }]]);
        const rec = recorder();
        await runStreamAgent(baseOpts({
            transportCall: t.transportCall, emitter: rec.emitter,
            baseRequest: { messages: [{ role: 'user', content: 'hi' }], _meta: { artifactRaw: { mimeType: 'text/plain', kind: 'text' } } },
            idGen: (p) => `${p}-0`,
        }));
        const close = rec.events.find(e => e.type === 'artifact-close') as { inline: boolean };
        expect(close.inline).toBe(false);
    });
});

describe('runStreamAgent — artifactXml mode', () => {
    it('splits chat text from inline <artifact> tags via the state machine', async () => {
        const t = scriptedTransport([[
            { type: 'text', delta: 'Here: <artifact mimeType="text/html" title="Page">' },
            { type: 'text', delta: '<h1>Hi</h1></artifact> done' },
            { type: 'done' },
        ]]);
        const rec = recorder();
        await runStreamAgent(baseOpts({
            transportCall: t.transportCall, emitter: rec.emitter,
            baseRequest: { messages: [{ role: 'user', content: 'hi' }], _meta: { artifactXml: { mimeType: 'text/html', kind: 'html' } } },
            idGen: (p) => `${p}-0`,
        }));
        expect(rec.events.find(e => e.type === 'artifact-open')).toMatchObject({ id: 'artifact-xml-0', mimeType: 'text/html', kind: 'html', title: 'Page' });
        expect((rec.events.find(e => e.type === 'artifact-close') as { content: string }).content).toBe('<h1>Hi</h1>');
        // Chat text on either side is emitted as text-delta (the adapter parses it).
        expect(rec.events.some(e => e.type === 'text-delta' && (e as { delta: string }).delta === 'Here: ')).toBe(true);
        expect(rec.events.some(e => e.type === 'text-delta' && (e as { delta: string }).delta === ' done')).toBe(true);
    });

    it('finalizes a truncated XML artifact at the turn boundary', async () => {
        const t = scriptedTransport([[
            { type: 'text', delta: '<artifact mimeType="text/plain" title="T">' },
            { type: 'text', delta: 'no close here' },
            { type: 'done' },
        ]]);
        const rec = recorder();
        await runStreamAgent(baseOpts({
            transportCall: t.transportCall, emitter: rec.emitter,
            baseRequest: { messages: [{ role: 'user', content: 'hi' }], _meta: { artifactXml: { mimeType: 'text/plain', kind: 'text' } } },
            idGen: (p) => `${p}-0`,
        }));
        expect((rec.events.find(e => e.type === 'artifact-close') as { content: string })?.content).toBe('no close here');
    });

    it('raw takes precedence over xml when both hints are present', async () => {
        const t = scriptedTransport([[{ type: 'text', delta: '<artifact>x</artifact>' }, { type: 'done' }]]);
        const rec = recorder();
        await runStreamAgent(baseOpts({
            transportCall: t.transportCall, emitter: rec.emitter,
            baseRequest: {
                messages: [{ role: 'user', content: 'hi' }],
                _meta: { artifactRaw: { mimeType: 'text/plain', kind: 'text' }, artifactXml: { mimeType: 'text/html', kind: 'html' } },
            },
            idGen: (p) => `${p}-0`,
        }));
        // Raw mode → the literal `<artifact>` text becomes artifact body, not parsed.
        expect(rec.events.find(e => e.type === 'artifact-open')).toMatchObject({ id: 'artifact-raw-0' });
        expect((rec.events.find(e => e.type === 'artifact-close') as { content: string }).content).toBe('<artifact>x</artifact>');
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
            baseRequest: { messages: [{ role: 'user', content: 'hi' }], toolChoice: { name: 'save', input: { x: 1 } } },
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
            baseRequest: { messages: [{ role: 'user', content: 'hi' }], toolChoice: { name: 'ghost', input: {} } },
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
            baseRequest: { messages: [{ role: 'user', content: 'hi' }], toolChoice: { name: 'slow', input: {} } },
            toolLookup: () => async () => { const e = new Error('x'); e.name = 'AbortError'; throw e; },
            idGen: (p) => `${p}-0`,
        }));
        expect(rec.types()).toEqual(['run-start', 'tool-start', 'tool-aborted', 'run-done']);
        expect(t.calls).toHaveLength(0);
    });

    it('does NOT trigger on a plain (non-object) toolChoice like "auto"', async () => {
        const t = scriptedTransport([[{ type: 'text', delta: 'hello' }, { type: 'done' }]]);
        const rec = recorder();
        await runStreamAgent(baseOpts({
            transportCall: t.transportCall, emitter: rec.emitter,
            baseRequest: { messages: [{ role: 'user', content: 'hi' }], toolChoice: 'auto' },
        }));
        // No synthetic bypass: a normal single text turn.
        expect(rec.types()).toEqual(['run-start', 'turn-start', 'text-delta', 'text-flush', 'run-done']);
        expect(t.calls).toHaveLength(1);
    });
});

describe('runStreamAgent — multi-phase pipeline', () => {
    it('runs each phase as a turn, prepends its system message, and advances with reply context', async () => {
        const t = scriptedTransport([
            [{ type: 'text', delta: 'reply1' }, { type: 'done' }],
            [{ type: 'text', delta: 'reply2' }, { type: 'done', usage: { inputTokens: 4, outputTokens: 4 } }],
        ]);
        const rec = recorder();
        const usage = await runStreamAgent(baseOpts({
            transportCall: t.transportCall, emitter: rec.emitter,
            baseRequest: {
                messages: [{ role: 'user', content: 'go' }],
                _meta: { pipeline: [{ mode: 'text', system: 'PHASE1' }, { mode: 'text', system: 'PHASE2' }] },
            },
        }));

        expect(rec.types()).toEqual([
            'run-start',
            'turn-start', 'text-delta', 'text-flush', 'phase-advance',
            'turn-start', 'text-delta', 'text-flush',
            'run-done',
        ]);
        expect(rec.events.find(e => e.type === 'phase-advance')).toEqual({ type: 'phase-advance', index: 1 });
        // Each turn is prefixed with its phase's system message…
        expect(t.calls[0]!.messages[0]).toEqual({ role: 'system', content: 'PHASE1' });
        expect(t.calls[1]!.messages[0]).toEqual({ role: 'system', content: 'PHASE2' });
        // …and phase 1's reply is carried into phase 2 as assistant context.
        expect(t.calls[1]!.messages.some(m => m.role === 'assistant' && m.content === 'reply1')).toBe(true);
        expect(usage).toEqual({ inputTokens: 4, outputTokens: 4 });
    });

    it('an artifact phase injects the artifactRaw hint so the turn streams into an artifact', async () => {
        const t = scriptedTransport([[{ type: 'text', delta: '<h1>Hi</h1>' }, { type: 'done' }]]);
        const rec = recorder();
        await runStreamAgent(baseOpts({
            transportCall: t.transportCall, emitter: rec.emitter,
            baseRequest: {
                messages: [{ role: 'user', content: 'make a page' }],
                _meta: { pipeline: [{ mode: 'artifact', system: 'MAKE', mimeType: 'text/html', kind: 'html' }] },
            },
            idGen: (p) => `${p}-0`,
        }));
        // Single last phase → no phase-advance; the whole turn is one raw artifact.
        expect(rec.events.find(e => e.type === 'artifact-open')).toMatchObject({ id: 'artifact-raw-0', kind: 'html' });
        expect((rec.events.find(e => e.type === 'artifact-close') as { content: string }).content).toBe('<h1>Hi</h1>');
        expect(rec.types()).not.toContain('phase-advance');
        expect(t.calls[0]!.messages[0]).toEqual({ role: 'system', content: 'MAKE' });
    });
});
