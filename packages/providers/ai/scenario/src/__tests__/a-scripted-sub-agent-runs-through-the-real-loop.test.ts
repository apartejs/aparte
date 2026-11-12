/**
 * A scripted sub-agent runs through the real loop.
 *
 * The step makes the scripted model call one ordinary tool, `delegate`, with what a real
 * model would send; the tool the provider hands out runs the sub-agent as a nested loop of
 * core's own, whose model is that sub-agent's script. So the page sees what it would see
 * from a real model delegating: the call, the sub-agent opening on it, its words carrying
 * its `agentId`, its end, the call answered with its text — and then the parent's next turn.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { createScenarioProvider, scenarioSubagentTool } from '../index.js';
import { endsOf, of, page, starts, textOf } from './page.js';

afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
});

describe('a scripted sub-agent', () => {
    it('opens on the delegate call, speaks as itself, and answers the call with its text', async () => {
        const provider = createScenarioProvider({
            pacing: 'instant',
            turns: [
                [{ text: 'Let me hand that off.' }, { subagents: [{ name: 'Researcher', task: 'Read the parser', turns: ['The parser is fine.'] }], id: 'd1' }],
                'All good, then.',
            ],
        });
        const p = page(provider, [scenarioSubagentTool(provider)]);
        await p.send('Is the parser fine?');

        const parent = of(p.events, undefined);
        // The parent's call: an ordinary tool, with what a real model sends.
        expect(parent.find((e) => e.type === 'tool-start')).toMatchObject({
            toolCallId: 'd1', name: 'delegate', input: { agents: [{ name: 'Researcher', task: 'Read the parser' }] },
        });

        // One sub-agent, the call's own: it opens on it.
        const [start] = starts(p.events);
        expect(start).toMatchObject({ toolCallId: 'd1', name: 'Researcher', description: 'Read the parser' });
        expect(textOf(p.events, start!.agentId)).toBe('The parser is fine.');
        expect(endsOf(p.events)).toEqual([expect.objectContaining({ agentId: start!.agentId, status: 'done', result: 'The parser is fine.' })]);

        // In order: the call, the sub-agent, its end, the call answered, the parent's next turn.
        const at = (pred: (e: (typeof p.events)[number]) => boolean): number => p.events.findIndex(pred);
        const callStart = at((e) => e.type === 'tool-start' && e.toolCallId === 'd1');
        const agentStart = at((e) => e.type === 'agent-start');
        const agentEnd = at((e) => e.type === 'agent-end');
        const resolved = at((e) => e.type === 'tool-resolved' && e.toolCallId === 'd1');
        expect(callStart).toBeLessThan(agentStart);
        expect(agentStart).toBeLessThan(agentEnd);
        expect(agentEnd).toBeLessThan(resolved);
        expect(p.events[resolved]).toMatchObject({ result: 'The parser is fine.' });
        expect(textOf(p.events, undefined)).toBe('Let me hand that off.All good, then.');
        expect(p.events.slice(resolved).some((e) => e.type === 'turn-start' && (e as { agentId?: string }).agentId === undefined)).toBe(true);

        // None of the sub-agent's words in the reply.
        expect(p.reply()?.segments?.filter((s) => s.type === 'text').map((s) => (s as { content: string }).content)).toEqual(['Let me hand that off.', 'All good, then.']);
    });

    it('takes its turns in order, the last repeating, as `turns` does', async () => {
        const provider = createScenarioProvider({
            pacing: 'instant',
            turns: [
                [{ subagents: [{ name: 'Looper', task: 'Count', turns: [[{ text: 'One.' }, { tool: 'tick' }], [{ text: 'Two.' }, { tool: 'tick' }], 'Done counting.'] }] }],
                'Counted.',
            ],
        });
        const tick = { tool: { name: 'tick', description: 'Tick.', inputSchema: { type: 'object' } }, handler: async (call: { id: string }) => ({ toolCallId: call.id, content: 'ok' }) };
        const p = page(provider, [scenarioSubagentTool(provider), tick]);
        await p.send('Count');
        const [start] = starts(p.events);
        expect(textOf(p.events, start!.agentId)).toBe('One.Two.Done counting.');
        expect(endsOf(p.events)[0]).toMatchObject({ status: 'done', result: 'Done counting.' });
    });

    it('a sub-agent whose model fails fails alone: the call is answered with a sentence that says so', async () => {
        const provider = createScenarioProvider({
            pacing: 'instant',
            turns: [
                [{ subagents: [{ name: 'Flaky', task: 'Try', turns: [[{ text: 'Trying…' }, { error: 'model overloaded' }]] }], id: 'd1' }],
                'It failed; I will do it myself.',
            ],
        });
        const p = page(provider, [scenarioSubagentTool(provider)]);
        await p.send('Go');
        expect(endsOf(p.events)[0]).toMatchObject({ status: 'failed', error: 'model overloaded' });
        const resolved = p.events.find((e) => e.type === 'tool-resolved' && e.toolCallId === 'd1');
        expect(resolved).toMatchObject({ result: expect.stringContaining('model overloaded') });
        expect((resolved as { result: string }).result).toContain('Flaky');
        expect(textOf(p.events, undefined)).toBe('It failed; I will do it myself.');
    });

    it('a tool of another name, when the step names one', async () => {
        const provider = createScenarioProvider({
            pacing: 'instant',
            turns: [[{ subagents: [{ name: 'R', task: 'Read', turns: ['Read.'] }], toolName: 'research' }], 'Ok.'],
        });
        const p = page(provider, [scenarioSubagentTool(provider, { name: 'research' })]);
        await p.send('Go');
        expect(p.events.find((e) => e.type === 'tool-start')).toMatchObject({ name: 'research' });
        expect(endsOf(p.events)[0]).toMatchObject({ status: 'done', result: 'Read.' });
    });
});
