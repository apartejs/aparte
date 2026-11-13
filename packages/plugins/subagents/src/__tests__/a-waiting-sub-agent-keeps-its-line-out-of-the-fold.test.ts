/**
 * A waiting sub-agent keeps its line out of the fold.
 *
 * With `setTurnSummary`, a run of finished steps folds behind one line. A sub-agent that
 * waits for a person — an approval asked from inside it — is something to read, not a step:
 * the call that opened it says `awaiting-approval` for as long as it waits, so its line stays
 * out of the fold, reads "Waiting", and the waiting dots stay off. Answered, the call runs
 * again and its line folds with the rest.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { aparteGlobalConfig } from '@aparte/core';
import { setupSubagents, subagentStatus } from '../index.js';
import { as, callIn, chat, shown } from './harness.js';

let stop: (() => void) | undefined;
afterEach(() => {
    document.body.innerHTML = '';
    stop?.();
    aparteGlobalConfig.reset();
});

const inFold = (row: HTMLElement | null): boolean => !!row?.closest('.aparte-turn');
const dotsShown = (host: HTMLElement): boolean => {
    const dots = host.querySelector<HTMLElement>('.aparte-waiting');
    return !!dots && !dots.hidden;
};

describe('a waiting sub-agent', () => {
    it('keeps its line out of the fold, says it waits, and keeps the dots off', () => {
        aparteGlobalConfig.setTurnSummary(true);
        stop = setupSubagents();
        const c = chat();
        c.run(
            { type: 'run-start' },
            { type: 'turn-start' },
            { type: 'tool-start', toolCallId: 's1', name: 'search', input: {} },
            { type: 'tool-resolved', toolCallId: 's1', result: 'found' },
            { type: 'tool-start', toolCallId: 'c1', name: 'delegate', input: {} },
            { type: 'agent-start', agentId: 'a1', name: 'Writer', toolCallId: 'c1' },
            ...as('a1', { type: 'turn-start' }, { type: 'tool-start', toolCallId: 'w1', name: 'write_file', input: {} }),
        );
        // Working: a step like any other, in the fold.
        expect(inFold(c.row('tool-c1'))).toBe(true);

        c.run(...as('a1', { type: 'tool-awaiting-approval', toolCallId: 'w1', name: 'write_file', input: {} }));
        const call = callIn(c.segments(), 'c1')!;
        expect(call.status).toBe('awaiting-approval');
        expect(subagentStatus(call)).toBe('waiting');
        const row = c.row('tool-c1')!;
        expect(inFold(row)).toBe(false);
        expect(shown(row, 'state')).toBe('Waiting');
        expect(dotsShown(c.host)).toBe(false);

        // Answered: it runs again, and folds with the rest.
        c.run(...as('a1', { type: 'tool-approved', toolCallId: 'w1' }));
        expect(callIn(c.segments(), 'c1')!.status).toBe('pending');
        expect(subagentStatus(callIn(c.segments(), 'c1')!)).toBe('running');
        expect(inFold(c.row('tool-c1'))).toBe(true);
    });

    it('a refusal settles the question as well', () => {
        stop = setupSubagents();
        const c = chat();
        c.run(
            { type: 'run-start' },
            { type: 'tool-start', toolCallId: 'c1', name: 'delegate', input: {} },
            { type: 'agent-start', agentId: 'a1', name: 'Writer', toolCallId: 'c1' },
            ...as('a1',
                { type: 'turn-start' },
                { type: 'tool-start', toolCallId: 'w1', name: 'write_file', input: {} },
                { type: 'tool-awaiting-approval', toolCallId: 'w1', name: 'write_file', input: {} },
                { type: 'tool-rejected', toolCallId: 'w1', reason: 'no', by: 'person' },
            ),
        );
        expect(callIn(c.segments(), 'c1')!.status).toBe('pending');
    });
});
