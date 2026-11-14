/**
 * A sub-agent's gated call says whose it is.
 *
 * The person asked to approve a call needs to know who wants it run: the reply's own model,
 * or a sub-agent a tool opened. The resolver is handed `agent` — the sub-agent's id and the
 * name it was started with — for a call of a sub-agent, the innermost one for a call of a
 * sub-agent's sub-agent, and nothing for the run's own call.
 */
import { describe, it, expect, vi } from 'vitest';
import { runStreamAgent } from '../stream-run';
import { runSubAgent } from '../sub-agent';
import type { StreamApprovalResolver, StreamRunEvent, StreamToolHandler } from '../stream-events';
import { ask, done, recorder, scripted, text, toolUse } from './sub-agent-script';

/** `delegate` opens `researcher`, whose `dig` opens `digger`; every `write` is gated. */
function setup() {
    const delegate: StreamToolHandler = async (_call, signal, run) =>
        ({ content: (await runSubAgent(run!, { name: 'researcher', request: ask('child') }, signal)).text });
    const dig: StreamToolHandler = async (_call, signal, run) =>
        ({ content: (await runSubAgent(run!, { name: 'digger', request: ask('grandchild') }, signal)).text });
    const { transportCall } = scripted({
        parent: [[toolUse('p1', 'write'), toolUse('c1', 'delegate'), done], [text('Done.'), done]],
        child: [[toolUse('w1', 'write'), toolUse('d1', 'dig'), done], [text('dug'), done]],
        grandchild: [[toolUse('g1', 'write'), done], [text('deep'), done]],
    });
    const approvalResolver = vi.fn<StreamApprovalResolver>(async () => ({ approved: true }));
    const { events, emitter } = recorder();
    const options = {
        messageId: 'm1',
        baseRequest: ask('parent'),
        transportCall,
        toolLookup: (name: string) => ({ delegate, dig } as Record<string, StreamToolHandler>)[name] ?? (async () => ({ content: 'ok' })),
        toolConfigLookup: (name: string) => name === 'write' ? { needsApproval: true } : undefined,
        approvalResolver,
        emitter,
        signal: new AbortController().signal,
    };
    return { approvalResolver, events, options };
}

const startOf = (events: StreamRunEvent[], name: string) =>
    events.find((e): e is Extract<StreamRunEvent, { type: 'agent-start' }> => e.type === 'agent-start' && e.name === name)!;

describe("a sub-agent's call says who asks", () => {
    // One call after another, nothing waits for a turn, and the resolver a sub-agent asks
    // through is the run's own: it must still say whose call it is.
    it.each([true, false])("hands the resolver the sub-agent's id and name, the innermost one, and none for the run's own call (parallelTools: %s)", async (parallelTools) => {
        const { approvalResolver, events, options } = setup();
        await runStreamAgent({ ...options, parallelTools });

        const asked = Object.fromEntries(approvalResolver.mock.calls.map(([call]) => [call.id, call]));
        expect(Object.keys(asked).sort()).toEqual(['g1', 'p1', 'w1']);
        expect('agent' in asked['p1']!).toBe(false);
        expect(asked['w1']!.agent).toEqual({ id: startOf(events, 'researcher').agentId, name: 'researcher' });
        // The grandchild's call is the digger's, not the researcher's that opened it.
        expect(asked['g1']!.agent).toEqual({ id: startOf(events, 'digger').agentId, name: 'digger' });
    });

    it('a sub-agent started with no name is still named by its id', async () => {
        const anonymous: StreamToolHandler = async (_call, signal, run) =>
            ({ content: (await runSubAgent(run!, { request: ask('child') }, signal)).text });
        const { approvalResolver, events, options } = setup();
        await runStreamAgent({ ...options, toolLookup: (name) => name === 'delegate' ? anonymous : async () => ({ content: 'ok' }) });

        const call = approvalResolver.mock.calls.map(([c]) => c).find((c) => c.id === 'w1')!;
        const start = events.find((e) => e.type === 'agent-start')!;
        expect(call.agent).toEqual({ id: (start as { agentId: string }).agentId });
    });
});
