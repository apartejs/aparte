/**
 * A scripted sub-agent can delegate in turn.
 *
 * A `subagents` step in a sub-agent's turn is a call of the NESTED loop, which looks the
 * `delegate` handler up as the run does and hands it its own run: the grandchild opens on
 * the child's call, carries the child as its parent, and the child reads its answer.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { createScenarioProvider, scenarioSubagentTool } from '../index.js';
import { endsOf, of, page, starts, textOf } from './page.js';

afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
});

describe('a sub-agent whose script delegates', () => {
    it('opens a grandchild on its own call, and reads its answer', async () => {
        const provider = createScenarioProvider({
            pacing: 'instant',
            turns: [
                [{ subagents: [{
                    name: 'Lead',
                    task: 'Audit the parser',
                    turns: [
                        [{ text: 'Splitting the work.' }, { subagents: [{ name: 'Helper', task: 'Read the tests', turns: ['Tests are green.'] }], id: 'n1' }],
                        'Audit done: tests are green.',
                    ],
                }], id: 'd1' }],
                'The audit is done.',
            ],
        });
        const p = page(provider, [scenarioSubagentTool(provider)]);
        await p.send('Audit');

        const [lead, helper] = starts(p.events);
        expect(lead).toMatchObject({ name: 'Lead', toolCallId: 'd1' });
        expect(lead!.parentAgentId).toBeUndefined();
        // The grandchild: on the child's call, the child its parent.
        expect(helper).toMatchObject({ name: 'Helper', toolCallId: 'n1', parentAgentId: lead!.agentId });
        expect(of(p.events, lead!.agentId).find((e) => e.type === 'tool-start')).toMatchObject({ toolCallId: 'n1', name: 'delegate' });
        expect(textOf(p.events, helper!.agentId)).toBe('Tests are green.');

        // The child read the grandchild's answer, and the parent read the child's.
        expect(of(p.events, lead!.agentId).find((e) => e.type === 'tool-resolved')).toMatchObject({ toolCallId: 'n1', result: 'Tests are green.' });
        expect(endsOf(p.events).map((e) => [e.agentId, e.status])).toEqual([[helper!.agentId, 'done'], [lead!.agentId, 'done']]);
        expect(p.events.find((e) => e.type === 'tool-resolved' && e.toolCallId === 'd1')).toMatchObject({ result: 'Audit done: tests are green.' });
        expect(textOf(p.events, undefined)).toBe('The audit is done.');
    });
});
