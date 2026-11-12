/**
 * Events arriving after a sub-agent's end still reach its lane.
 *
 * An agent run elsewhere does not always say things in order: a question asked at the end
 * of the turn comes after the sub-agent ended `waiting`; a call left without an answer is
 * stopped after it ended `done`; and a resumed run sends the outcomes of the person's answers
 * before it announces the sub-agent again. The lane is kept for the whole reply, and an
 * `agent-start` for a sub-agent already known continues it rather than opening another.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { aparteGlobalConfig } from '@aparte/core';
import { setupSubagents, subagentOf, subagentStatus, type AparteSubagentStartEventDetail } from '../index.js';
import { as, callIn, chat, textOfAll } from './harness.js';

let stop: (() => void) | undefined;
afterEach(() => {
    document.body.innerHTML = '';
    stop?.();
    aparteGlobalConfig.reset();
});

const laneOf = (c: ReturnType<typeof chat>) => subagentOf(callIn(c.segments(), 'c1')!)!;

describe('events after the end', () => {
    it('a call stopped after the sub-agent ended done', () => {
        stop = setupSubagents();
        const c = chat();
        c.run(
            { type: 'run-start' },
            { type: 'tool-start', toolCallId: 'c1', name: 'delegate', input: {} },
            { type: 'agent-start', agentId: 'a1', name: 'Worker', toolCallId: 'c1' },
            ...as('a1', { type: 'turn-start' }, { type: 'tool-start', toolCallId: 'x1', name: 'fetch', input: {} }),
            { type: 'agent-end', agentId: 'a1', status: 'done' },
            ...as('a1', { type: 'tool-aborted', toolCallId: 'x1', cause: 'stopped' }),
        );
        expect(callIn(laneOf(c).segments, 'x1')!.status).toBe('aborted');
        expect(laneOf(c).status).toBe('done');
    });

    it('a question asked after it ended waiting, then a resume that answers before announcing it again', () => {
        stop = setupSubagents();
        const c = chat();
        const started: AparteSubagentStartEventDetail[] = [];
        c.host.addEventListener('aparte-subagent-start', (e) => started.push(e.detail));
        c.run(
            { type: 'run-start' },
            { type: 'tool-start', toolCallId: 'c1', name: 'delegate', input: {} },
            { type: 'agent-start', agentId: 'a1', name: 'Writer', toolCallId: 'c1' },
            ...as('a1', { type: 'turn-start' }, { type: 'text-delta', delta: 'Writing.' }, { type: 'text-flush' }, { type: 'tool-start', toolCallId: 'w1', name: 'write_file', input: {} }),
            { type: 'agent-end', agentId: 'a1', status: 'waiting' },
            ...as('a1', { type: 'tool-awaiting-approval', toolCallId: 'w1', name: 'write_file', input: {} }),
            { type: 'run-suspended', pending: [{ toolCallId: 'w1', name: 'write_file', input: {}, reason: 'approval', agentId: 'a1' }] },
        );
        expect(callIn(laneOf(c).segments, 'w1')!.status).toBe('awaiting-approval');
        expect(subagentStatus(callIn(c.segments(), 'c1')!)).toBe('waiting');

        // The resumed run: a new adapter on the same reply.
        const resumed = c.again();
        for (const e of [
            { type: 'run-start' },
            ...as('a1', { type: 'tool-approved', toolCallId: 'w1' }, { type: 'tool-resolved', toolCallId: 'w1', result: 'written' }),
            { type: 'agent-start', agentId: 'a1', name: 'Writer', toolCallId: 'c1' },
            ...as('a1', { type: 'turn-start' }, { type: 'text-delta', delta: 'Done writing.' }, { type: 'text-flush' }),
            { type: 'agent-end', agentId: 'a1', status: 'done' },
            { type: 'tool-resolved', toolCallId: 'c1', result: 'ok' },
            { type: 'run-done' },
        ] as Parameters<typeof resumed>[0][]) resumed(e);

        const lane = laneOf(c);
        // One lane, continued: the text before the pause and after it, the call answered.
        expect(textOfAll(lane.segments)).toBe('Writing. Done writing.');
        expect(callIn(lane.segments, 'w1')!.status).toBe('resolved');
        expect(lane.status).toBe('done');
        expect(c.segments().filter((s) => s.type === 'subagent')).toHaveLength(0);
        // The app hears it start again.
        expect(started.map((s) => s.agentId)).toEqual(['a1', 'a1']);
    });

    it('after a reload, the outcomes held for a sub-agent not announced yet reach its saved lane', () => {
        stop = setupSubagents();
        const before = chat({ id: 'before' });
        before.run(
            { type: 'run-start' },
            { type: 'tool-start', toolCallId: 'c1', name: 'delegate', input: {} },
            { type: 'agent-start', agentId: 'a1', name: 'Writer', toolCallId: 'c1' },
            ...as('a1', { type: 'turn-start' }, { type: 'text-delta', delta: 'Writing.' }, { type: 'text-flush' }, { type: 'tool-start', toolCallId: 'w1', name: 'write_file', input: {} }),
            { type: 'agent-end', agentId: 'a1', status: 'waiting' },
            ...as('a1', { type: 'tool-awaiting-approval', toolCallId: 'w1', name: 'write_file', input: {} }),
            { type: 'run-suspended', pending: [] },
        );
        // Saved as a paused run (its own call carries the ticket a resume needs).
        const saved = JSON.parse(JSON.stringify(before.viewport.getMessages()));
        before.host.remove();
        stop();
        stop = setupSubagents();

        const c = chat({ messages: saved, id: 'after' });
        // The paused reply resumes: running again.
        c.viewport.updateMessage?.('a1', { status: 'streaming' });
        const resumed = c.again();
        for (const e of [
            ...as('a1', { type: 'tool-approved', toolCallId: 'w1' }, { type: 'tool-resolved', toolCallId: 'w1', result: 'written' }),
            { type: 'agent-start', agentId: 'a1', name: 'Writer', toolCallId: 'c1' },
            ...as('a1', { type: 'turn-start' }, { type: 'text-delta', delta: 'Done.' }, { type: 'text-flush' }),
            { type: 'agent-end', agentId: 'a1', status: 'done' },
        ] as Parameters<typeof resumed>[0][]) resumed(e);

        const lane = subagentOf(callIn(c.segments(), 'c1')!)!;
        expect(textOfAll(lane.segments)).toBe('Writing. Done.');
        expect(callIn(lane.segments, 'w1')!.status).toBe('resolved');
        expect(lane.status).toBe('done');
    });
});
