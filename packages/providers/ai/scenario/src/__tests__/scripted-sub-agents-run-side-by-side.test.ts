/**
 * Scripted sub-agents of one step run side by side.
 *
 * The engine runs the calls of a model step one after the other, so sub-agents run at the
 * same time only inside one tool. A step with several opens them all from its one call,
 * together and detached: each is a line of its own (no `toolCallId`), their events
 * interleave as they stream, and the call answers with one short block per sub-agent.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { createScenarioProvider, scenarioSubagentTool } from '../index.js';
import { endsOf, page, starts, textOf } from './page.js';

afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
});

describe('three scripted sub-agents in one step', () => {
    it('start together, detached, interleave, and the call names each', async () => {
        const provider = createScenarioProvider({
            // Paced: interleaving needs time to pass between chunks.
            pacing: { chunk: 4, delay: 2 },
            turns: [
                [{ subagents: [
                    { name: 'Reader', task: 'Read the parser', turns: ['The parser reads tokens.'] },
                    { name: 'Searcher', task: 'Find its callers', turns: ['Two callers found.'] },
                    { name: 'Tester', task: 'Run the tests', turns: ['All tests pass.'] },
                ], id: 'd1' }],
                'Thanks, team.',
            ],
        });
        const p = page(provider, [scenarioSubagentTool(provider)]);
        await p.send('Look into the parser');

        const opened = starts(p.events);
        expect(opened.map((s) => s.name)).toEqual(['Reader', 'Searcher', 'Tester']);
        expect(opened.map((s) => s.description)).toEqual(['Read the parser', 'Find its callers', 'Run the tests']);
        // Detached: none is the call's own line.
        for (const s of opened) expect(s.toolCallId).toBeUndefined();

        // All three opened before the first one ended: together, not one after the other.
        const lastStart = Math.max(...opened.map((s) => p.events.indexOf(s)));
        const firstEnd = p.events.findIndex((e) => e.type === 'agent-end');
        expect(lastStart).toBeLessThan(firstEnd);

        // Interleaved: the run of text deltas switches owner more than three times.
        const owners = p.events
            .filter((e) => e.type === 'text-delta' && (e as { agentId?: string }).agentId !== undefined)
            .map((e) => (e as { agentId?: string }).agentId);
        const switches = owners.filter((o, i) => i > 0 && o !== owners[i - 1]).length;
        expect(switches).toBeGreaterThan(2);

        // Each said its own words, and ended done.
        expect(opened.map((s) => textOf(p.events, s.agentId))).toEqual(['The parser reads tokens.', 'Two callers found.', 'All tests pass.']);
        expect(endsOf(p.events).map((e) => e.status)).toEqual(['done', 'done', 'done']);

        // The parent reads one short block per sub-agent.
        const resolved = p.events.find((e) => e.type === 'tool-resolved' && e.toolCallId === 'd1') as { result: string } | undefined;
        expect(resolved?.result).toBe('Reader: The parser reads tokens.\n\nSearcher: Two callers found.\n\nTester: All tests pass.');
        expect(textOf(p.events, undefined)).toBe('Thanks, team.');
    });

    it('one that fails does not fail the call: its block says so, the others answer', async () => {
        const provider = createScenarioProvider({
            pacing: 'instant',
            turns: [
                [{ subagents: [
                    { name: 'Good', task: 'A', turns: ['Fine.'] },
                    { name: 'Bad', task: 'B', turns: [[{ error: 'rate limited' }]] },
                ], id: 'd1' }],
                'Partly done.',
            ],
        });
        const p = page(provider, [scenarioSubagentTool(provider)]);
        await p.send('Go');
        const resolved = p.events.find((e) => e.type === 'tool-resolved' && e.toolCallId === 'd1') as { result: string } | undefined;
        expect(resolved?.result).toContain('Good: Fine.');
        expect(resolved?.result).toMatch(/Bad: .*rate limited/);
        expect(endsOf(p.events).map((e) => e.status).sort()).toEqual(['done', 'failed']);
        expect(textOf(p.events, undefined)).toBe('Partly done.');
    });
});
