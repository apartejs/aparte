/**
 * A stopped turn stops its sub-agents.
 *
 * Our own loop ends a sub-agent `stopped` before its call is aborted; an agent elsewhere may
 * say nothing, and the page closes the call itself. Either way the line reads "Stopped",
 * nothing on it keeps moving, the lane is saved as it was, and the app hears the end.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { aparteGlobalConfig, type AparteMessage, type AparteSegment } from '@aparte/core';
import { setupSubagents, subagentOf, subagentStatus, type AparteSubagentEndEventDetail } from '../index.js';
import { as, callIn, chat, shown, textOfAll } from './harness.js';

let stop: (() => void) | undefined;
afterEach(() => {
    document.body.innerHTML = '';
    stop?.();
    aparteGlobalConfig.reset();
});

function midway() {
    stop = setupSubagents();
    const c = chat();
    const ends: AparteSubagentEndEventDetail[] = [];
    c.host.addEventListener('aparte-subagent-end', (e) => ends.push(e.detail));
    c.run(
        { type: 'run-start' },
        { type: 'tool-start', toolCallId: 'c1', name: 'delegate', input: {} },
        { type: 'agent-start', agentId: 'a1', name: 'Researcher', toolCallId: 'c1' },
        ...as('a1',
            { type: 'turn-start' },
            { type: 'text-delta', delta: 'Halfway through' },
            { type: 'tool-start', toolCallId: 'r1', name: 'read_file', input: {} },
        ),
    );
    return { c, ends };
}

describe('a stopped turn stops its sub-agents', () => {
    it('in our loop: the sub-agent ends stopped, its call is aborted, the line reads Stopped', () => {
        const { c, ends } = midway();
        c.run(
            { type: 'agent-end', agentId: 'a1', status: 'stopped' },
            { type: 'tool-aborted', toolCallId: 'c1', cause: 'stopped' },
            { type: 'run-aborted' },
        );
        const call = callIn(c.segments(), 'c1')!;
        expect(subagentOf(call)!.status).toBe('stopped');
        expect(subagentStatus(call)).toBe('stopped');
        const row = c.row('tool-c1')!;
        expect(row.getAttribute('data-status')).toBe('aborted');
        expect(shown(row, 'state')).toBe('Stopped');
        // Nothing moves: no shimmer, and the second line says what it did, not what it does.
        expect(row.querySelector('.aparte-shimmer')).toBeNull();
        expect(shown(row, 'activity')).toMatch(/^1 tool · /);
        // The lane as it was, its open call stopped with the run, its text kept.
        const lane = subagentOf(call)!.segments;
        expect(textOfAll(lane)).toContain('Halfway through');
        expect(callIn(lane, 'r1')!.status).toBe('aborted');
        expect(lane.every((s: AparteSegment) => s.isStreaming !== true)).toBe(true);
        expect(ends).toEqual([{ targetId: 'chat-1', messageId: 'a1', agentId: 'a1', status: 'stopped' }]);
    });

    it('from an agent that says nothing: the page closes the call, and the line reads Stopped', () => {
        const { c, ends } = midway();
        c.run({ type: 'run-aborted' });
        // What the client does after a Stop (`_closeOpenCalls`): every open call aborted.
        const message = c.viewport.getMessage('a1') as AparteMessage;
        c.viewport.updateMessage?.('a1', {
            segments: message.segments!.map((s) => (s.id === 'tool-c1' ? { ...s, status: 'aborted' } : s)) as AparteSegment[],
        });
        const call = callIn(c.segments(), 'c1')!;
        // Stored as it was last heard, read as what it is.
        expect(subagentOf(call)!.status).toBe('running');
        expect(subagentStatus(call)).toBe('stopped');
        // The app is told it ended, since nothing else will.
        expect(ends).toEqual([{ targetId: 'chat-1', messageId: 'a1', agentId: 'a1', status: 'stopped' }]);
    });

    it('writes nothing once the turn is over', async () => {
        const { c } = midway();
        c.run({ type: 'run-aborted' });
        const before = JSON.stringify(c.segments());
        // A late event for the sub-agent, from a run that is over.
        c.run(...as('a1', { type: 'text-delta', delta: 'Too late' }));
        await new Promise((r) => setTimeout(r, 40));
        expect(JSON.stringify(c.segments())).toBe(before);
    });
});
