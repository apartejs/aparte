/**
 * AG-UI 1.0 (subagents): "State is run-scoped." A `STATE_SNAPSHOT` or `STATE_DELTA` a
 * sub-agent sends updates the run's state exactly as one from the parent does; its
 * `subagentRunId` is provenance, and a consumer must not withhold the update because a
 * sub-agent sent it. There is no per-sub-agent state to keep apart — so the thread's
 * state the runner sends back on the next run holds what the sub-agent wrote.
 */
import { describe, it, expect } from 'vitest';
import { agUi, finished, scripted, sse, started, turn } from './replay.js';

const next = () => sse(started('r2', 'conv'), finished({}, 'r2', 'conv'));

describe('a sub-agent’s state is the run’s', () => {
    it('applies a sub-agent’s delta to the state the parent set, and sends the whole back', async () => {
        const f = scripted(sse(
            started('r1', 'conv'),
            { type: 'STATE_SNAPSHOT', snapshot: { plan: ['search'] } },
            { type: 'SUBAGENT_STARTED', subagentRunId: 's1', name: 'researcher' },
            { type: 'STATE_DELTA', delta: [{ op: 'add', path: '/notes', value: 'two papers' }], subagentRunId: 's1' },
            { type: 'SUBAGENT_FINISHED', subagentRunId: 's1' },
            finished({}, 'r1', 'conv'),
        ), next());
        const runner = agUi(f.fetch, { threadId: 'conv' });
        await turn(runner);
        await turn(runner);
        expect(f.bodies[1]!['state']).toEqual({ plan: ['search'], notes: 'two papers' });
    });

    it('lets a sub-agent’s snapshot replace the run’s state, as the parent’s would', async () => {
        const f = scripted(sse(
            started('r1', 'conv'),
            { type: 'STATE_SNAPSHOT', snapshot: { plan: ['search'] } },
            { type: 'SUBAGENT_STARTED', subagentRunId: 's1', name: 'researcher' },
            { type: 'STATE_SNAPSHOT', snapshot: { plan: ['search', 'read'] }, subagentRunId: 's1' },
            { type: 'SUBAGENT_FINISHED', subagentRunId: 's1' },
            finished({}, 'r1', 'conv'),
        ), next());
        const runner = agUi(f.fetch, { threadId: 'conv' });
        const first = await turn(runner);
        await turn(runner);
        expect(f.bodies[1]!['state']).toEqual({ plan: ['search', 'read'] });
        // Provenance only: a state update draws nothing, under nobody.
        expect(first.events.map((e) => e.type)).toEqual(['run-start', 'turn-start', 'agent-start', 'agent-end', 'run-done']);
    });
});
