/**
 * A sub-agent cut short (`agent-end` with `status: 'partial'`) reads "Cut short", not Done.
 *
 * Its run stopped before it answered, at its turn limit or on a call it could not make: what it
 * found is its result, but the work is not done. Read as Done, the line contradicted the turn
 * limit's error in the transcript under it; read as Stopped, it looked like the person's Stop.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { aparteGlobalConfig } from '@aparte/core';
import { setupSubagents, subagentsTurnLabel } from '../index.js';
import { as, chat, frame, shown } from './harness.js';

let stop: (() => void) | undefined;
afterEach(() => {
    document.body.innerHTML = '';
    stop?.();
    aparteGlobalConfig.reset();
});

describe('a sub-agent cut short', () => {
    it('reads Cut short on its line, though its call answered', async () => {
        stop = setupSubagents();
        const c = chat();
        c.run(
            { type: 'run-start' },
            { type: 'tool-start', toolCallId: 'c1', name: 'delegate', input: {} },
            { type: 'agent-start', agentId: 'a1', name: 'Reader', toolCallId: 'c1' },
            ...as('a1', { type: 'turn-start' }, { type: 'text-delta', delta: 'Half of it.' }),
            { type: 'agent-end', agentId: 'a1', status: 'partial', reason: 'turn-limit', result: 'Half of it.' },
            { type: 'tool-resolved', toolCallId: 'c1', result: 'Half of it.' },
            { type: 'run-done' },
        );
        await frame();
        const row = c.row('tool-c1');
        expect(`${shown(row, 'note') ?? ''} ${shown(row, 'activity') ?? ''}`).toContain('Cut short');
    });

    it('is counted as cut short in a fold', () => {
        aparteGlobalConfig.setTurnSummary({ label: subagentsTurnLabel });
        stop = setupSubagents();
        const c = chat();
        c.run(
            { type: 'run-start' },
            { type: 'turn-start' },
            { type: 'tool-start', toolCallId: 'c1', name: 'delegate', input: {} },
            { type: 'agent-start', agentId: 'a1', name: 'Reader', toolCallId: 'c1' },
            { type: 'tool-start', toolCallId: 'c2', name: 'delegate', input: {} },
            { type: 'agent-start', agentId: 'a2', name: 'Tester', toolCallId: 'c2' },
            { type: 'agent-end', agentId: 'a1', status: 'done' },
            { type: 'tool-resolved', toolCallId: 'c1', result: 'ok' },
            { type: 'agent-end', agentId: 'a2', status: 'partial', reason: 'turn-limit' },
            { type: 'tool-resolved', toolCallId: 'c2', result: 'some' },
        );
        expect(c.host.querySelector('.aparte-turn > summary > .aparte-turn__label')?.textContent).toBe('2 sub-agents · 1 done, 1 cut short');
    });
});
