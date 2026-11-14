/**
 * A sub-agent's line says the step it announces.
 *
 * A step is a name with a start and an end ("Reading the parser"). While one of the sub-agent's
 * is open and none of its calls runs, its line's second line says the step; a running call wins,
 * as its line already said what it was on. When the step ends the line goes back to what it said
 * before. Live only: nothing of it is written into the sub-agent's saved conversation, and it is
 * gone with the sub-agent's end.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { aparteGlobalConfig } from '@aparte/core';
import { setupSubagents } from '../index.js';
import { as, chat, shown } from './harness.js';

let stop: (() => void) | undefined;
afterEach(() => {
    document.body.innerHTML = '';
    stop?.();
    vi.restoreAllMocks();
    aparteGlobalConfig.reset();
});

function started() {
    const c = chat();
    c.run(
        { type: 'run-start' },
        { type: 'tool-start', toolCallId: 'c1', name: 'delegate', input: {} },
        { type: 'agent-start', agentId: 'a1', name: 'Researcher', description: 'Find the callers', toolCallId: 'c1' },
        ...as('a1', { type: 'turn-start' }),
    );
    return c;
}

describe("a sub-agent's line says its step", () => {
    it('while no call of it runs, and goes back to what it said when the step ends', () => {
        stop = setupSubagents();
        const c = started();
        c.run(...as('a1', { type: 'step-start', name: 'Reading the parser' }));
        expect(shown(c.row('tool-c1'), 'activity')).toBe('Reading the parser');
        c.run(...as('a1', { type: 'step-end', name: 'Reading the parser' }));
        expect(shown(c.row('tool-c1'), 'activity')).toBe('Starting…');
    });

    it('lets a running call win, and says the step again once the call is done', () => {
        stop = setupSubagents();
        const c = started();
        c.run(...as('a1', { type: 'step-start', name: 'Reading the parser' }, { type: 'tool-start', toolCallId: 'g1', name: 'grep', input: {} }));
        expect(shown(c.row('tool-c1'), 'activity')).toBe('grep');
        c.run(...as('a1', { type: 'tool-resolved', toolCallId: 'g1', result: '3 hits' }));
        expect(shown(c.row('tool-c1'), 'activity')).toBe('Reading the parser');
    });

    it('says the latest open step, and the one before it once that one ends', () => {
        stop = setupSubagents();
        const c = started();
        c.run(...as('a1', { type: 'step-start', name: 'Reading the parser' }, { type: 'step-start', name: 'Checking tokens' }));
        expect(shown(c.row('tool-c1'), 'activity')).toBe('Checking tokens');
        c.run(...as('a1', { type: 'step-end', name: 'Checking tokens' }));
        expect(shown(c.row('tool-c1'), 'activity')).toBe('Reading the parser');
    });

    it('is gone with the sub-agent\'s end, even a step nobody closed', () => {
        stop = setupSubagents();
        const c = started();
        c.run(
            ...as('a1', { type: 'step-start', name: 'Reading the parser' }),
            { type: 'agent-end', agentId: 'a1', status: 'done', result: 'Found them.' },
        );
        expect(shown(c.row('tool-c1'), 'activity')).not.toBe('Reading the parser');
    });

    it('is never written into the sub-agent\'s saved conversation', () => {
        stop = setupSubagents();
        const c = started();
        c.run(...as('a1', { type: 'step-start', name: 'Reading the parser' }));
        expect(JSON.stringify(c.segments())).not.toContain('Reading the parser');
    });

    it('the reply\'s own step is not the sub-agent\'s', () => {
        stop = setupSubagents();
        const c = started();
        c.run({ type: 'step-start', name: 'Planning' });
        expect(shown(c.row('tool-c1'), 'activity')).toBe('Starting…');
    });
});
