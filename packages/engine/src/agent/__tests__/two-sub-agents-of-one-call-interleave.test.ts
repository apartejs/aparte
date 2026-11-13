/**
 * One tool can run several sub-agents at once. Each is `detached` — it has its own line,
 * not the call's — and their events interleave as they arrive, each still carrying its own
 * `agentId`, so a host sorts them without guessing.
 */
import { describe, it, expect } from 'vitest';
import { runStreamAgent } from '../stream-run';
import { runSubAgent } from '../sub-agent';
import type { StreamRunEvent, StreamToolHandler } from '../stream-events';
import { agentIdOf, ask, done, indexOf, recorder, scripted, text, toolUse } from './sub-agent-script';

const fanOut: StreamToolHandler = async (_call, signal, run) => {
    const [a, b] = await Promise.all([
        runSubAgent(run!, { name: 'a', detached: true, request: ask('a') }, signal),
        runSubAgent(run!, { name: 'b', detached: true, request: ask('b') }, signal),
    ]);
    return { content: `${a.text} | ${b.text}` };
};

describe('two sub-agents of one call interleave', () => {
    it('each keeps its own id while their events interleave, and both end before the call', async () => {
        const { transportCall } = scripted({
            parent: [[toolUse('c1', 'fan_out'), done], [text('Merged.'), done]],
            a: [[text('a1'), { wait: 5 }, text('a2'), { wait: 5 }, text('a3'), done]],
            b: [[{ wait: 2 }, text('b1'), { wait: 5 }, text('b2'), { wait: 5 }, text('b3'), done]],
        });
        const { events, emitter } = recorder();
        await runStreamAgent({
            messageId: 'm1', baseRequest: ask('parent'), transportCall,
            toolLookup: () => fanOut, emitter, signal: new AbortController().signal,
        });

        const starts = events.filter((e): e is Extract<StreamRunEvent, { type: 'agent-start' }> => e.type === 'agent-start');
        expect(starts.map((s) => s.name)).toEqual(['a', 'b']);
        // Detached: neither claims the call's line.
        for (const s of starts) expect(s.toolCallId).toBeUndefined();
        const idOf = Object.fromEntries(starts.map((s) => [s.name!, s.agentId]));
        expect(idOf['a']).not.toBe(idOf['b']);

        const deltas = events.filter((e): e is Extract<StreamRunEvent, { type: 'text-delta' }> => e.type === 'text-delta' && agentIdOf(e) !== undefined);
        for (const d of deltas) expect(agentIdOf(d), d.delta).toBe(idOf[d.delta[0]!]);
        // They did interleave: b spoke between a's first and last words.
        const order = deltas.map((d) => d.delta);
        expect(order.indexOf('b1')).toBeGreaterThan(order.indexOf('a1'));
        expect(order.indexOf('b1')).toBeLessThan(order.indexOf('a3'));

        const resolved = indexOf(events, (e) => e.type === 'tool-resolved' && e.toolCallId === 'c1');
        const ends = events.filter((e) => e.type === 'agent-end');
        expect(ends).toHaveLength(2);
        for (const end of ends) expect(events.indexOf(end)).toBeLessThan(resolved);
        expect(events[resolved]).toMatchObject({ result: 'a1a2a3 | b1b2b3' });
    });
});
