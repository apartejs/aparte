/**
 * A sub-agent of a sub-agent keeps its own attribution all the way out: its events carry
 * its own `agentId`, not its parent's, and its `agent-start` / `agent-end` name its parent
 * in `parentAgentId`. What it says is its own too — never counted in its parent's answer.
 */
import { describe, it, expect } from 'vitest';
import { runStreamAgent } from '../stream-run';
import { runSubAgent } from '../sub-agent';
import type { StreamRunEvent, StreamToolHandler } from '../stream-events';
import { agentIdOf, ask, done, indexOf, recorder, scripted, text, toolUse } from './sub-agent-script';

const answers: Record<string, Awaited<ReturnType<typeof runSubAgent>>> = {};
/** `delegate` opens the child, the child's `research` opens the grandchild. */
const handler: StreamToolHandler = async (call, signal, run) => {
    const model = call.name === 'delegate' ? 'child' : 'grandchild';
    const answer = await runSubAgent(run!, { name: model, request: ask(model) }, signal);
    answers[model] = answer;
    return { content: answer.text };
};

const startOf = (events: StreamRunEvent[], name: string) =>
    events.find((e) => e.type === 'agent-start' && e.name === name) as Extract<StreamRunEvent, { type: 'agent-start' }>;

describe('a grandchild keeps its own attribution', () => {
    it('its events carry its own id, and its start and end name its parent', async () => {
        const { transportCall } = scripted({
            parent: [[toolUse('c1', 'delegate'), done], [text('All done.'), done]],
            child: [[text('Asking. '), toolUse('g1', 'research'), done], [text('Child answer.'), done]],
            grandchild: [[text('Grandchild answer.'), done]],
        });
        const { events, emitter } = recorder();
        await runStreamAgent({
            messageId: 'm1', baseRequest: ask('parent'), transportCall,
            toolLookup: () => handler, emitter, signal: new AbortController().signal,
        });

        const child = startOf(events, 'child');
        const grandchild = startOf(events, 'grandchild');
        expect(child).toEqual({ type: 'agent-start', agentId: expect.any(String), name: 'child', toolCallId: 'c1' });
        expect(grandchild).toEqual({
            type: 'agent-start', agentId: expect.any(String), name: 'grandchild', toolCallId: 'g1', parentAgentId: child.agentId,
        });
        expect(grandchild.agentId).not.toBe(child.agentId);

        // The child's call that opened the grandchild is the child's row.
        expect(events.find((e) => e.type === 'tool-start' && e.toolCallId === 'g1')).toMatchObject({ agentId: child.agentId });
        // The grandchild's text is the grandchild's.
        expect(events.find((e) => e.type === 'text-delta' && e.delta === 'Grandchild answer.')).toMatchObject({ agentId: grandchild.agentId });

        const grandEnd = indexOf(events, (e) => e.type === 'agent-end' && e.agentId === grandchild.agentId);
        const childEnd = indexOf(events, (e) => e.type === 'agent-end' && e.agentId === child.agentId);
        expect(events[grandEnd]).toEqual({
            type: 'agent-end', agentId: grandchild.agentId, status: 'done', result: 'Grandchild answer.', parentAgentId: child.agentId,
        });
        expect(events[childEnd]).toEqual({ type: 'agent-end', agentId: child.agentId, status: 'done', result: 'Child answer.' });
        // In order: the grandchild ends, the child's call resolves, the child ends, the parent's call resolves.
        const g1 = indexOf(events, (e) => e.type === 'tool-resolved' && e.toolCallId === 'g1');
        const c1 = indexOf(events, (e) => e.type === 'tool-resolved' && e.toolCallId === 'c1');
        expect([grandEnd, g1, childEnd, c1]).toEqual([...[grandEnd, g1, childEnd, c1]].sort((a, b) => a - b));
        expect(events[g1]).toMatchObject({ agentId: child.agentId });
        expect(agentIdOf(events[c1]!)).toBeUndefined();

        // Each answer is its own: the grandchild's words are not in the child's.
        expect(answers['child']!.text).toBe('Child answer.');
        expect(answers['grandchild']!.text).toBe('Grandchild answer.');
    });

    it('a Stop ends the grandchild first, then the child, then the call', async () => {
        const controller = new AbortController();
        const { transportCall } = scripted({
            parent: [[toolUse('c1', 'delegate'), done]],
            child: [[toolUse('g1', 'research'), done], [text('never'), done]],
            grandchild: [[text('working'), { wait: 30 }, text(' late'), done]],
        });
        const { events, emitter } = recorder();
        await runStreamAgent({
            messageId: 'm1', baseRequest: ask('parent'), transportCall,
            toolLookup: () => handler,
            emitter: (e) => {
                emitter(e);
                if (e.type === 'text-delta' && e.delta === 'working') queueMicrotask(() => controller.abort());
            },
            signal: controller.signal,
        });
        await new Promise((r) => setTimeout(r, 50));

        const child = startOf(events, 'child');
        const grandchild = startOf(events, 'grandchild');
        const ends = events.filter((e) => e.type === 'agent-end');
        expect(ends).toEqual([
            { type: 'agent-end', agentId: grandchild.agentId, status: 'stopped', parentAgentId: child.agentId },
            { type: 'agent-end', agentId: child.agentId, status: 'stopped' },
        ]);
        const childEnd = events.indexOf(ends[1]!);
        expect(childEnd).toBeLessThan(indexOf(events, (e) => e.type === 'tool-aborted' && e.toolCallId === 'c1'));
        expect(events.slice(childEnd + 1).filter((e) => agentIdOf(e) !== undefined)).toEqual([]);
    });
});
