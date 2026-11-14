/**
 * Two sub-agents running at the same time each make a gated call. A person is asked about
 * one call at a time, and a row says "awaiting approval" only when its question is the one
 * open: the second sub-agent's call is announced (`tool-awaiting-approval`, which paints the
 * row and raises the page's approval request) once the first one is decided, never while it
 * still waits behind it.
 */
import { describe, it, expect } from 'vitest';
import { runStreamAgent } from '../stream-run';
import { runSubAgent } from '../sub-agent';
import type { StreamRunEvent, StreamToolHandler } from '../stream-events';
import { agentIdOf, ask, done, scripted, text, toolUse } from './sub-agent-script';

const settle = () => new Promise((r) => setTimeout(r, 0));

const delegate: StreamToolHandler = async (call, signal, runCtx) => {
    const model = (call.input as { model: string }).model;
    const out = await runSubAgent(runCtx!, { name: model, request: ask(model) }, signal);
    return { content: out.text };
};

describe("a sub-agent's question shows only when it is asked", () => {
    it('announces the second sub-agent’s call only once the first is decided', async () => {
        const { transportCall } = scripted({
            parent: [[toolUse('c1', 'delegate', { model: 'a' }), toolUse('c2', 'delegate', { model: 'b' }), done], [text('Merged.'), done]],
            a: [[toolUse('xa', 'gated'), done], [text('a done'), done]],
            b: [[toolUse('xb', 'gated'), done], [text('b done'), done]],
        });
        const events: StreamRunEvent[] = [];
        const open: Array<{ id: string; answer: (d: { approved: boolean }) => void }> = [];
        const run = runStreamAgent({
            messageId: 'm1', baseRequest: ask('parent'), transportCall,
            toolLookup: (n) => (n === 'delegate' ? delegate : async () => ({ content: 'ran' })),
            toolConfigLookup: (n) => (n === 'gated' ? { needsApproval: true } : undefined),
            approvalResolver: (call) => new Promise((resolve) => { open.push({ id: call.id, answer: resolve }); }),
            emitter: (e) => { events.push(e); },
            signal: new AbortController().signal,
        });
        const awaiting = () => events.filter((e) => e.type === 'tool-awaiting-approval').map((e) => (e as { toolCallId: string }).toolCallId);

        await settle();
        // Both sub-agents made their call; only the first is shown as asked.
        expect(events.filter((e) => e.type === 'tool-start' && agentIdOf(e)).map((e) => (e as { toolCallId: string }).toolCallId).sort()).toEqual(['xa', 'xb']);
        expect(awaiting()).toEqual(['xa']);
        expect(open.map((q) => q.id)).toEqual(['xa']);

        open[0]!.answer({ approved: true });
        await settle();
        expect(awaiting()).toEqual(['xa', 'xb']);
        const second = events.findIndex((e) => e.type === 'tool-awaiting-approval' && e.toolCallId === 'xb');
        const firstDecided = events.findIndex((e) => e.type === 'tool-approved' && e.toolCallId === 'xa');
        expect(second).toBeGreaterThan(firstDecided);

        open[1]!.answer({ approved: true });
        await run;
    });
});
