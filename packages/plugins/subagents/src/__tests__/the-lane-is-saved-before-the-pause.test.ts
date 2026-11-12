/**
 * The lane is saved before the pause, and before the end.
 *
 * A sub-agent's text is written to its call once per frame. The conversation is saved when
 * the chat says the reply paused, finished or stopped — so by the time the chat's own
 * listeners hear `aparte-message-paused` or `aparte-message-done`, the segment must carry
 * the whole lane, including what streamed since the last frame.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { aparteGlobalConfig, type AparteSegment } from '@aparte/core';
import { setupSubagents, subagentOf, subagentStatus } from '../index.js';
import { as, callIn, chat, textOfAll, type Chat } from './harness.js';

let stop: (() => void) | undefined;
afterEach(() => {
    document.body.innerHTML = '';
    stop?.();
    aparteGlobalConfig.reset();
});

/** What the chat element holds for the reply when it hears `name` — what a store would save. */
function savedOn(c: Chat, name: string): () => AparteSegment[] | undefined {
    let saved: AparteSegment[] | undefined;
    c.host.addEventListener(name, () => { saved = JSON.parse(JSON.stringify(c.segments())) as AparteSegment[]; });
    return () => saved;
}

describe('the lane is saved', () => {
    it('before the pause: the text streamed since the last frame is on the call', () => {
        stop = setupSubagents();
        const c = chat();
        const saved = savedOn(c, 'aparte-message-paused');
        c.run(
            { type: 'run-start' },
            { type: 'tool-start', toolCallId: 'c1', name: 'delegate', input: {} },
            { type: 'agent-start', agentId: 'a1', name: 'Writer', toolCallId: 'c1' },
            ...as('a1',
                { type: 'turn-start' },
                { type: 'tool-start', toolCallId: 'w1', name: 'write_file', input: { path: 'a.ts' } },
                { type: 'turn-start' },
                // The first delta opens a segment, which is written at once; the second only
                // grows it, and waits for the frame.
                { type: 'text-delta', delta: 'One more thing ' },
                { type: 'text-delta', delta: 'before I ask.' },
            ),
            // An agent elsewhere: the sub-agent waits, its question comes at the end of the turn.
            { type: 'agent-end', agentId: 'a1', status: 'waiting' },
            ...as('a1', { type: 'tool-awaiting-approval', toolCallId: 'w1', name: 'write_file', input: { path: 'a.ts' } }),
            { type: 'run-suspended', pending: [{ toolCallId: 'w1', name: 'write_file', input: { path: 'a.ts' }, reason: 'approval', agentId: 'a1' }] },
        );
        const call = callIn(saved()!, 'c1')!;
        const lane = subagentOf(call)!;
        expect(lane.status).toBe('waiting');
        expect(textOfAll(lane.segments)).toContain('One more thing before I ask.');
        expect(callIn(lane.segments, 'w1')!.status).toBe('awaiting-approval');
        // The call that opened it waits too, and its line says so.
        expect(call.status).toBe('awaiting-approval');
        expect(subagentStatus(call)).toBe('waiting');
    });

    it('before the end: the chat hears the reply is done after the lane is written', () => {
        stop = setupSubagents();
        const c = chat();
        const saved = savedOn(c, 'aparte-message-done');
        c.run(
            { type: 'run-start' },
            { type: 'tool-start', toolCallId: 'c1', name: 'delegate', input: {} },
            { type: 'agent-start', agentId: 'a1', name: 'Writer', toolCallId: 'c1' },
            ...as('a1', { type: 'turn-start' }, { type: 'text-delta', delta: 'The last ' }, { type: 'text-delta', delta: 'words.' }),
        );
        // What the client says when its runner returns: no `run-done` reached the observers.
        c.viewport.dispatchEvent(new CustomEvent('aparte-message-done', { bubbles: true, composed: true, detail: { messageId: 'a1' } }));
        expect(textOfAll(subagentOf(callIn(saved()!, 'c1')!)!.segments)).toContain('The last words.');
    });

    it('before the end of the run: the last delta is on the call when `run-done` is handled', () => {
        stop = setupSubagents();
        const c = chat();
        c.run(
            { type: 'run-start' },
            { type: 'tool-start', toolCallId: 'c1', name: 'delegate', input: {} },
            { type: 'agent-start', agentId: 'a1', name: 'Writer', toolCallId: 'c1' },
            ...as('a1', { type: 'turn-start' }, { type: 'text-delta', delta: 'Said just ' }, { type: 'text-delta', delta: 'before the end.' }),
            { type: 'run-done' },
        );
        expect(textOfAll(subagentOf(callIn(c.segments(), 'c1')!)!.segments)).toContain('Said just before the end.');
    });

    it("before the stop: the chat hears `aparte-message-aborted` after the lane is written", () => {
        stop = setupSubagents();
        const c = chat();
        const saved = savedOn(c, 'aparte-message-aborted');
        c.run(
            { type: 'run-start' },
            { type: 'tool-start', toolCallId: 'c1', name: 'delegate', input: {} },
            { type: 'agent-start', agentId: 'a1', name: 'Writer', toolCallId: 'c1' },
            ...as('a1', { type: 'turn-start' }, { type: 'text-delta', delta: 'Cut ' }, { type: 'text-delta', delta: 'here.' }),
            { type: 'run-aborted' },
        );
        expect(textOfAll(subagentOf(callIn(saved()!, 'c1')!)!.segments)).toContain('Cut here.');
    });

    it('before the pause of the run itself: the last delta is on the call when `run-suspended` is handled', () => {
        stop = setupSubagents();
        const c = chat();
        const saved = savedOn(c, 'aparte-message-paused');
        c.run(
            { type: 'run-start' },
            { type: 'tool-start', toolCallId: 'c1', name: 'delegate', input: {} },
            { type: 'agent-start', agentId: 'a1', name: 'Writer', toolCallId: 'c1' },
            ...as('a1', { type: 'turn-start' }, { type: 'text-delta', delta: 'Still ' }, { type: 'text-delta', delta: 'going.' }),
            { type: 'run-suspended', pending: [] },
        );
        expect(textOfAll(subagentOf(callIn(saved()!, 'c1')!)!.segments)).toContain('Still going.');
    });

    it("a sub-agent of the plugin's own still working is saved open at the pause", () => {
        stop = setupSubagents();
        const c = chat();
        const saved = savedOn(c, 'aparte-message-paused');
        c.run(
            { type: 'run-start' },
            { type: 'agent-start', agentId: 'a1', name: 'Planner' },
            ...as('a1', { type: 'turn-start' }, { type: 'text-delta', delta: 'Waiting on you.' }),
            { type: 'agent-end', agentId: 'a1', status: 'waiting' },
            { type: 'run-suspended', pending: [] },
        );
        const own = saved()!.find((s) => s.id === 'subagent-a1')!;
        // The message settled its segments when the run paused; the sub-agent is not over.
        expect(own.isStreaming).toBe(true);
        expect(subagentStatus(own)).toBe('waiting');
        expect(textOfAll(subagentOf(own)!.segments)).toContain('Waiting on you.');
    });
});
