/**
 * A reloaded sub-agent reads stopped.
 *
 * A conversation saved while a sub-agent worked comes back with nobody to finish it. The
 * reply's own segments are adopted settled (an open call becomes `aborted`, nothing
 * streams), and the sub-agent stored as `running` reads `stopped` from that alone — the
 * plugin keeps no bookkeeping that a reload could lose. Its conversation comes back with it.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { aparteGlobalConfig, type AparteMessage, type AparteSegment } from '@aparte/core';
import { setupSubagents, subagentOf, subagentStatus } from '../index.js';
import { as, callIn, chat, frame, shown, textOfAll } from './harness.js';

let stop: (() => void) | undefined;
afterEach(() => {
    document.body.innerHTML = '';
    stop?.();
    aparteGlobalConfig.reset();
});

/** The reply `a1` as an app saves it on each change, mid-run: two sub-agents at work. */
async function savedMidRun(): Promise<AparteMessage[]> {
    const c = chat({ id: 'before' });
    c.run(
        { type: 'run-start' },
        { type: 'tool-start', toolCallId: 'c1', name: 'delegate', input: {} },
        { type: 'agent-start', agentId: 'a1', name: 'Researcher', toolCallId: 'c1' },
        { type: 'agent-start', agentId: 'a2', name: 'Planner' },
        ...as('a1', { type: 'turn-start' }, { type: 'text-delta', delta: 'Reading.' }, { type: 'tool-start', toolCallId: 'r1', name: 'read_file', input: {} }),
        ...as('a2', { type: 'turn-start' }, { type: 'text-delta', delta: 'Planning.' }),
    );
    await frame();
    // Saved as a store saves a reply: settled (the save normalises the status).
    const saved = (JSON.parse(JSON.stringify(c.viewport.getMessages())) as AparteMessage[])
        .map((m) => ({ ...m, status: 'completed' as const, isStreaming: false }));
    c.host.remove();
    return saved;
}

describe('a reloaded sub-agent', () => {
    it('reads stopped on the call that opened it, and nothing on its line moves', async () => {
        stop = setupSubagents();
        const saved = await savedMidRun();
        expect(subagentOf(callIn(saved[1]!.segments!, 'c1')!)!.status).toBe('running');

        const c = chat({ messages: saved, id: 'after' });
        const call = callIn(c.segments(), 'c1')!;
        expect(call.status).toBe('aborted');
        expect(subagentStatus(call)).toBe('stopped');
        const row = c.row('tool-c1')!;
        expect(shown(row, 'name')).toBe('Researcher');
        expect(shown(row, 'state')).toBe('Stopped');
        expect(shown(row, 'activity')).toBeNull();
        expect(row.querySelector('.aparte-shimmer')).toBeNull();
        // Its conversation came back with it.
        expect(textOfAll(subagentOf(call)!.segments)).toContain('Reading.');
    });

    it("reads stopped on a segment of the plugin's own, which streams no more", async () => {
        stop = setupSubagents();
        const saved = await savedMidRun();
        const c = chat({ messages: saved, id: 'after' });
        const own = c.segment('subagent-a2') as AparteSegment;
        expect(own.isStreaming).toBe(false);
        expect(subagentStatus(own)).toBe('stopped');
        const row = c.row('subagent-a2')!;
        expect(shown(row, 'name')).toBe('Planner');
        expect(shown(row, 'state')).toBe('Stopped');
        expect(row.querySelector('.aparte-shimmer, .aparte-spinner:not([hidden])')).toBeNull();
    });
});
