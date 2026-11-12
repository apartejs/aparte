/**
 * A scripted sub-agent stops with the turn.
 *
 * Stop aborts the call that opened it, and the nested loop runs on that call's signal: the
 * sub-agent ends `stopped` at once — mid-pause, without waiting out its script — the call is
 * aborted, and the run ends.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { createScenarioProvider, scenarioSubagentTool } from '../index.js';
import { endsOf, page, starts, textOf } from './page.js';

afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
});

describe('Stop during a scripted sub-agent', () => {
    it('ends the sub-agents stopped, aborts the call, and ends the run without waiting out the script', async () => {
        const provider = createScenarioProvider({
            pacing: 'instant',
            turns: [
                [{ subagents: [
                    { name: 'Slow', task: 'Take your time', turns: [[{ text: 'Starting.' }, { wait: 60_000 }, { text: 'Never said.' }]] },
                    { name: 'Slower', task: 'Take longer', turns: [[{ text: 'Me too.' }, { wait: 120_000 }, { text: 'Never said either.' }]] },
                ], id: 'd1' }],
                'Never reached.',
            ],
        });
        const p = page(provider, [scenarioSubagentTool(provider)]);
        const began = Date.now();
        p.start('Go slowly');
        await vi.waitFor(() => expect(textOf(p.events, starts(p.events)[1]?.agentId ?? '-')).toBe('Me too.'));
        p.client.abort();
        await vi.waitFor(() => expect(p.events.some((e) => e.type === 'run-done')).toBe(true));
        expect(Date.now() - began).toBeLessThan(5_000);

        expect(endsOf(p.events).map((e) => e.status)).toEqual(['stopped', 'stopped']);
        expect(p.events.some((e) => e.type === 'tool-aborted' && e.toolCallId === 'd1')).toBe(true);
        expect(p.events.some((e) => e.type === 'tool-resolved' && e.toolCallId === 'd1')).toBe(false);
        expect(JSON.stringify(p.events)).not.toContain('Never');
    });
});
