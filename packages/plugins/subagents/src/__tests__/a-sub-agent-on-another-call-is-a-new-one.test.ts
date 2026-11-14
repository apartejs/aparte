/**
 * A sub-agent announced on another call is a new one, even under a known id.
 *
 * A reply's lanes are kept across a pause, since the run resumes into the same reply, and an
 * `agent-start` for a sub-agent already known continues it: an AG-UI agent re-announces the
 * one it resumes, with the same call, and a re-announce naming no call continues too. But a
 * backend that mints ids per request (our own server loop did, until it stopped) names the
 * resume's first sub-agent like the paused run's: taken for the first one resumed, the first
 * line got the second's name and text, the second call had no sub-agent, and that was saved.
 * A known id announced on a DIFFERENT call is a new sub-agent, with its own line.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { aparteGlobalConfig, type AparteStreamRunEvent } from '@aparte/core';
import { setupSubagents, subagentOf } from '../index.js';
import { as, callIn, chat, textOfAll, type Chat } from './harness.js';

let stop: (() => void) | undefined;
afterEach(() => {
    document.body.innerHTML = '';
    stop?.();
    aparteGlobalConfig.reset();
});

/** A sub-agent on `call`, from its start to its answer. */
const delegated = (call: string, agentId: string, name: string, words: string): AparteStreamRunEvent[] => [
    { type: 'turn-start' },
    { type: 'tool-start', toolCallId: call, name: 'delegate', input: {} },
    { type: 'agent-start', agentId, name, toolCallId: call },
    ...as(agentId, { type: 'turn-start' }, { type: 'text-delta', delta: words }, { type: 'text-flush' }),
    { type: 'agent-end', agentId, status: 'done', result: words },
    { type: 'tool-resolved', toolCallId: call, result: words },
];

/** The first run pauses after a sub-agent on c1; the resume opens one on c3, named `second`. */
function acrossAPause(c: Chat, firstId: string, secondId: string): void {
    c.run(
        { type: 'run-start' },
        ...delegated('c1', firstId, 'first', 'From the first.'),
        { type: 'tool-start', toolCallId: 'd1', name: 'delete_file', input: {} },
        { type: 'tool-awaiting-approval', toolCallId: 'd1', name: 'delete_file', input: {} },
        { type: 'run-suspended', pending: [{ toolCallId: 'd1', name: 'delete_file', input: {}, reason: 'approval' }] },
    );
    const resumed = c.again();
    for (const e of [
        { type: 'run-start' },
        { type: 'tool-resolved', toolCallId: 'd1', result: 'deleted' },
        ...delegated('c3', secondId, 'second', 'From the second.'),
        { type: 'turn-start' },
        { type: 'text-delta', delta: 'Done.' },
        { type: 'run-done' },
    ] as AparteStreamRunEvent[]) resumed(e);
}

const lineOn = (c: Chat, call: string) => subagentOf(callIn(c.segments(), call)!);

describe('two sub-agents of one reply across a pause', () => {
    it('get two lines, each with its own name and text', () => {
        stop = setupSubagents();
        const c = chat();
        acrossAPause(c, 'agent-1a', 'agent-2b');
        expect(lineOn(c, 'c1')).toMatchObject({ name: 'first', status: 'done' });
        expect(textOfAll(lineOn(c, 'c1')!.segments)).toBe('From the first.');
        expect(lineOn(c, 'c3')).toMatchObject({ name: 'second', status: 'done' });
        expect(textOfAll(lineOn(c, 'c3')!.segments)).toBe('From the second.');
    });

    it('get two lines when a backend gives both the same id, the second on another call', () => {
        stop = setupSubagents();
        const c = chat();
        acrossAPause(c, 'agent-0', 'agent-0');
        expect(lineOn(c, 'c1')).toMatchObject({ id: 'agent-0', name: 'first', status: 'done' });
        expect(textOfAll(lineOn(c, 'c1')!.segments)).toBe('From the first.');
        expect(lineOn(c, 'c3')).toMatchObject({ id: 'agent-0', name: 'second', status: 'done' });
        expect(textOfAll(lineOn(c, 'c3')!.segments)).toBe('From the second.');
        expect(c.segments().filter((s) => s.type === 'subagent')).toHaveLength(0);
    });

    it('a known id re-announced with no call continues its line', () => {
        stop = setupSubagents();
        const c = chat();
        c.run(
            { type: 'run-start' },
            { type: 'tool-start', toolCallId: 'c1', name: 'delegate', input: {} },
            { type: 'agent-start', agentId: 'a1', name: 'Writer', toolCallId: 'c1' },
            ...as('a1', { type: 'turn-start' }, { type: 'text-delta', delta: 'Before.' }, { type: 'text-flush' }),
            { type: 'agent-end', agentId: 'a1', status: 'waiting' },
            { type: 'run-suspended', pending: [] },
        );
        const resumed = c.again();
        for (const e of [
            { type: 'run-start' },
            { type: 'agent-start', agentId: 'a1' },
            ...as('a1', { type: 'turn-start' }, { type: 'text-delta', delta: 'After.' }, { type: 'text-flush' }),
            { type: 'agent-end', agentId: 'a1', status: 'done' },
            { type: 'tool-resolved', toolCallId: 'c1', result: 'ok' },
            { type: 'run-done' },
        ] as AparteStreamRunEvent[]) resumed(e);

        expect(lineOn(c, 'c1')).toMatchObject({ name: 'Writer', status: 'done' });
        expect(textOfAll(lineOn(c, 'c1')!.segments)).toBe('Before. After.');
        expect(c.segments().filter((s) => s.type === 'subagent')).toHaveLength(0);
    });

    it("a reused id's second sub-agent with no call of its own gets its own segment", () => {
        stop = setupSubagents();
        const c = chat();
        c.run(
            { type: 'run-start' },
            { type: 'agent-start', agentId: 'a1', name: 'Planner' },
            ...as('a1', { type: 'turn-start' }, { type: 'text-delta', delta: 'Planned.' }, { type: 'text-flush' }),
            { type: 'agent-end', agentId: 'a1', status: 'done' },
            // The same id, now on a call, whose line is free.
            ...delegated('c2', 'a1', 'Writer', 'Written.'),
            { type: 'run-done' },
        );
        const own = c.segments().find((s) => s.id === 'subagent-a1');
        expect(subagentOf(own!)).toMatchObject({ name: 'Planner', status: 'done' });
        expect(textOfAll(subagentOf(own!)!.segments)).toBe('Planned.');
        expect(lineOn(c, 'c2')).toMatchObject({ name: 'Writer', status: 'done' });
        expect(textOfAll(lineOn(c, 'c2')!.segments)).toBe('Written.');
    });

    it('the first sub-agent, left waiting by the pause, reads stopped once its id is reused on another call', () => {
        stop = setupSubagents();
        const c = chat();
        c.run(
            { type: 'run-start' },
            { type: 'tool-start', toolCallId: 'c1', name: 'delegate', input: {} },
            { type: 'agent-start', agentId: 'agent-0', name: 'first', toolCallId: 'c1' },
            ...as('agent-0', { type: 'turn-start' }, { type: 'text-delta', delta: 'Waiting for you.' }),
            { type: 'agent-end', agentId: 'agent-0', status: 'waiting' },
            { type: 'run-suspended', pending: [] },
        );
        const ended: unknown[] = [];
        c.host.addEventListener('aparte-subagent-end', (e) => ended.push((e as CustomEvent).detail));
        const resumed = c.again();
        // The resume's first sub-agent, under the paused run's id, on another call: nothing will
        // ever resume the first one.
        for (const e of [{ type: 'run-start' }, ...delegated('c3', 'agent-0', 'second', 'From the second.')] as AparteStreamRunEvent[]) resumed(e);

        expect(lineOn(c, 'c1')).toMatchObject({ name: 'first', status: 'stopped' });
        // Its text is settled as it stood, and streams no more.
        expect(textOfAll(lineOn(c, 'c1')!.segments)).toBe('Waiting for you.');
        expect(lineOn(c, 'c1')!.segments.some((s) => s.isStreaming === true)).toBe(false);
        // An app hears it end, stopped, before the second one's own end.
        expect(ended).toEqual([
            expect.objectContaining({ agentId: 'agent-0', status: 'stopped' }),
            expect.objectContaining({ agentId: 'agent-0', status: 'done' }),
        ]);
        expect(lineOn(c, 'c3')).toMatchObject({ name: 'second', status: 'done' });
        expect(textOfAll(lineOn(c, 'c3')!.segments)).toBe('From the second.');
    });

    it("a reused id's second sub-agent, on a call another one holds, gets a segment beside the first one's", () => {
        stop = setupSubagents();
        const c = chat();
        c.run(
            { type: 'run-start' },
            { type: 'agent-start', agentId: 'a1', name: 'Planner' },
            ...as('a1', { type: 'turn-start' }, { type: 'text-delta', delta: 'Planned.' }, { type: 'text-flush' }),
            { type: 'agent-end', agentId: 'a1', status: 'done' },
            { type: 'turn-start' },
            { type: 'tool-start', toolCallId: 'c2', name: 'delegate', input: {} },
            { type: 'agent-start', agentId: 'b1', name: 'Reader', toolCallId: 'c2' },
            // The same id as the planner's, on the call the reader's line already stands for.
            { type: 'agent-start', agentId: 'a1', name: 'Writer', toolCallId: 'c2' },
            ...as('a1', { type: 'turn-start' }, { type: 'text-delta', delta: 'Written.' }, { type: 'text-flush' }),
            { type: 'agent-end', agentId: 'a1', status: 'done' },
            { type: 'agent-end', agentId: 'b1', status: 'done' },
            { type: 'tool-resolved', toolCallId: 'c2', result: 'ok' },
            { type: 'run-done' },
        );
        const own = (id: string) => subagentOf(c.segments().find((s) => s.id === id)!);
        // The first keeps its own segment, untouched by the second.
        expect(own('subagent-a1')).toMatchObject({ id: 'a1', name: 'Planner', status: 'done' });
        expect(textOfAll(own('subagent-a1')!.segments)).toBe('Planned.');
        expect(own('subagent-a1-2')).toMatchObject({ id: 'a1', name: 'Writer', status: 'done' });
        expect(textOfAll(own('subagent-a1-2')!.segments)).toBe('Written.');
        // And the call's line is still the reader's.
        expect(lineOn(c, 'c2')).toMatchObject({ id: 'b1', name: 'Reader' });
    });
});
