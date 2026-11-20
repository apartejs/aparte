/**
 * A sub-agent saved while it waited goes on, on its own line, when the reply is resumed after a
 * reload: announced again or not.
 *
 * After a reload the plugin knows no lane. A resumed stream that answers the sub-agent's call
 * without announcing it again (an AG-UI agent attributing the result through its ticket) had its
 * events held "until it is announced", which never came, and dropped at the end of the run: the
 * transcript kept the destructive call as waiting, then read Stopped, though it ran. Announced
 * again with no call (the AG-UI runner meeting a tagged event), it got a second, empty line,
 * since only the call it named would have found the saved one. The saved line is found by the
 * sub-agent's id, on its call or on a segment of its own.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { aparteGlobalConfig, type AparteMessage, type AparteSegment, type AparteStreamRunEvent } from '@aparte/core';
import { setupSubagents, subagentOf } from '../index.js';
import { as, callIn, chat } from './harness.js';

let stop: (() => void) | undefined;
afterEach(() => {
    document.body.innerHTML = '';
    stop?.();
    aparteGlobalConfig.reset();
});

/** Page one: a sub-agent on c1 waits for an approval of its write; what the store saves on the pause. */
function pausedReply(): AparteMessage {
    stop = setupSubagents();
    const c = chat();
    let saved: AparteSegment[] | undefined;
    c.host.addEventListener('aparte-message-paused', () => { saved = JSON.parse(JSON.stringify(c.segments())) as AparteSegment[]; });
    c.run(
        { type: 'run-start' },
        { type: 'tool-start', toolCallId: 'c1', name: 'delegate', input: {} },
        { type: 'agent-start', agentId: 'sub1', name: 'Writer', toolCallId: 'c1' },
        ...as('sub1',
            { type: 'turn-start' },
            { type: 'text-delta', delta: 'Writing.' },
            { type: 'text-flush' },
            { type: 'tool-start', toolCallId: 'w1', name: 'write_file', input: { path: 'a.ts' } },
        ),
        { type: 'agent-end', agentId: 'sub1', status: 'waiting' },
        ...as('sub1', { type: 'tool-awaiting-approval', toolCallId: 'w1', name: 'write_file', input: { path: 'a.ts' } }),
        { type: 'run-suspended', pending: [{ toolCallId: 'w1', name: 'write_file', input: { path: 'a.ts' }, reason: 'approval', agentId: 'sub1' }] },
    );
    expect(saved, 'saved on the pause').toBeDefined();
    c.host.remove();
    stop();
    return {
        id: 'a1', role: 'assistant', status: 'completed', content: '',
        deferredCalls: [{ toolCallId: 'w1', name: 'write_file', input: { path: 'a.ts' }, reason: 'approval', agentId: 'sub1' }],
        segments: saved!,
    } as AparteMessage;
}

/** Page two, after the reload: the reply loaded, then resumed with `events`. */
function resume(reply: AparteMessage, events: AparteStreamRunEvent[]) {
    stop = setupSubagents();
    const c = chat({ messages: [reply] });
    const emit = c.again();
    for (const e of events) emit(e);
    return c;
}

const answer: AparteStreamRunEvent[] = [
    ...as('sub1', { type: 'tool-approved', toolCallId: 'w1' }, { type: 'tool-resolved', toolCallId: 'w1', result: 'written' }),
    { type: 'agent-end', agentId: 'sub1', status: 'done', result: 'Done.' },
    { type: 'tool-resolved', toolCallId: 'c1', result: 'Done.' },
    { type: 'run-done' },
];

describe('a sub-agent saved while it waited, resumed after a reload', () => {
    it('goes on on its line when the resumed stream does not announce it again', () => {
        const c = resume(pausedReply(), [{ type: 'run-start' }, ...answer]);
        const line = subagentOf(callIn(c.segments(), 'c1')!)!;
        expect(callIn(line.segments, 'w1')!.status).toBe('resolved');
    });

    it('goes on on its line, and no second one, when it is announced again with no call', () => {
        const c = resume(pausedReply(), [{ type: 'run-start' }, { type: 'agent-start', agentId: 'sub1' }, ...answer]);
        expect(c.segments().filter((s) => s.id.startsWith('subagent-sub1'))).toEqual([]);
        const line = subagentOf(callIn(c.segments(), 'c1')!)!;
        expect(callIn(line.segments, 'w1')!.status).toBe('resolved');
    });
});
