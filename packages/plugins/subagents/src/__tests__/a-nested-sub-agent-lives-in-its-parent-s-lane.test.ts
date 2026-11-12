/**
 * A sub-agent of a sub-agent lives in its parent's lane.
 *
 * The same two rules, one level down: opened by one of its parent's calls, it is kept on that
 * call, in the parent's lane; opened without one, it gets the plugin's own segment, in the
 * parent's lane. The reply holds neither — only the call that opened the parent.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { aparteGlobalConfig } from '@aparte/core';
import { setupSubagents, subagentOf, subagentStatus } from '../index.js';
import { as, callIn, chat, shown, textOfAll } from './harness.js';

let stop: (() => void) | undefined;
afterEach(() => {
    document.body.innerHTML = '';
    stop?.();
    aparteGlobalConfig.reset();
});

describe('a nested sub-agent', () => {
    it("lives in its parent's lane, on its parent's call or on a segment of its own", () => {
        stop = setupSubagents();
        const c = chat();
        c.run(
            { type: 'run-start' },
            { type: 'tool-start', toolCallId: 'c1', name: 'delegate', input: {} },
            { type: 'agent-start', agentId: 'a1', name: 'Lead', toolCallId: 'c1' },
            ...as('a1', { type: 'turn-start' }, { type: 'tool-start', toolCallId: 'c2', name: 'delegate', input: {} }),
            { type: 'agent-start', agentId: 'a2', name: 'Grepper', description: 'Find the callers', parentAgentId: 'a1', toolCallId: 'c2' },
            ...as('a2', { type: 'turn-start' }, { type: 'text-delta', delta: 'Grandchild speaks.' }, { type: 'text-flush' }),
            { type: 'agent-start', agentId: 'a3', name: 'Reader', parentAgentId: 'a1' },
            ...as('a3', { type: 'turn-start' }, { type: 'text-delta', delta: 'Another grandchild.' }, { type: 'text-flush' }),
            { type: 'agent-end', agentId: 'a2', status: 'done', parentAgentId: 'a1' },
            ...as('a1', { type: 'tool-resolved', toolCallId: 'c2', result: 'callers' }),
            { type: 'agent-end', agentId: 'a3', status: 'failed', error: 'no file', parentAgentId: 'a1' },
            { type: 'agent-end', agentId: 'a1', status: 'done' },
            { type: 'tool-resolved', toolCallId: 'c1', result: 'ok' },
            { type: 'run-done' },
        );

        // The reply: the one call that opened the lead.
        expect(c.segments().map((s) => s.id)).toEqual(['tool-c1']);
        const lead = subagentOf(callIn(c.segments(), 'c1')!)!;
        expect(textOfAll(lead.segments)).not.toMatch(/grandchild/i);

        // On the lead's call, in the lead's lane.
        const onCall = callIn(lead.segments, 'c2')!;
        const grepper = subagentOf(onCall)!;
        expect(grepper).toMatchObject({ id: 'a2', name: 'Grepper', parentId: 'a1', status: 'done' });
        expect(textOfAll(grepper.segments)).toContain('Grandchild speaks.');
        expect(subagentStatus(onCall)).toBe('done');

        // On a segment of its own, in the lead's lane.
        const own = lead.segments.find((s) => s.id === 'subagent-a3')!;
        expect(own.type).toBe('subagent');
        expect(subagentOf(own)).toMatchObject({ id: 'a3', status: 'failed', error: 'no file', parentId: 'a1' });
        expect(subagentStatus(own)).toBe('failed');

        // The lead's line counts its own calls, the nested one included.
        expect(shown(c.row('tool-c1'), 'note')).toMatch(/^1 tool · /);
    });

    it("its line in the lead's activity is named like its row", () => {
        stop = setupSubagents();
        const c = chat();
        c.run(
            { type: 'run-start' },
            { type: 'tool-start', toolCallId: 'c1', name: 'delegate', input: {} },
            { type: 'agent-start', agentId: 'a1', name: 'Lead', toolCallId: 'c1' },
            ...as('a1', { type: 'turn-start' }, { type: 'tool-start', toolCallId: 'c2', name: 'delegate', input: {} }),
            { type: 'agent-start', agentId: 'a2', name: 'Grepper', description: 'Find the callers', parentAgentId: 'a1', toolCallId: 'c2' },
        );
        expect(shown(c.row('tool-c1'), 'activity')).toBe('Grepper Find the callers');
    });

    it("announced before its parent's call, it is written on that call once the call starts", () => {
        stop = setupSubagents();
        const c = chat();
        c.run(
            { type: 'run-start' },
            { type: 'tool-start', toolCallId: 'c1', name: 'delegate', input: {} },
            { type: 'agent-start', agentId: 'a1', name: 'Lead', toolCallId: 'c1' },
            ...as('a1', { type: 'turn-start' }),
            { type: 'agent-start', agentId: 'a2', name: 'Early', parentAgentId: 'a1', toolCallId: 'c2' },
            ...as('a2', { type: 'turn-start' }, { type: 'text-delta', delta: 'Before my call.' }),
            ...as('a1', { type: 'tool-start', toolCallId: 'c2', name: 'delegate', input: {} }),
        );
        const lead = subagentOf(callIn(c.segments(), 'c1')!)!;
        expect(lead.segments.map((s) => s.id)).toEqual(['tool-c2']);
        expect(textOfAll(subagentOf(callIn(lead.segments, 'c2')!)!.segments)).toBe('Before my call.');
    });

    it('waiting for a person, it holds every call above it', () => {
        stop = setupSubagents();
        const c = chat();
        c.run(
            { type: 'run-start' },
            { type: 'tool-start', toolCallId: 'c1', name: 'delegate', input: {} },
            { type: 'agent-start', agentId: 'a1', name: 'Lead', toolCallId: 'c1' },
            ...as('a1', { type: 'turn-start' }, { type: 'tool-start', toolCallId: 'c2', name: 'delegate', input: {} }),
            { type: 'agent-start', agentId: 'a2', name: 'Writer', parentAgentId: 'a1', toolCallId: 'c2' },
            ...as('a2', { type: 'turn-start' }, { type: 'tool-start', toolCallId: 'w1', name: 'write_file', input: {} }),
            ...as('a2', { type: 'tool-awaiting-approval', toolCallId: 'w1', name: 'write_file', input: {} }),
        );
        const call = callIn(c.segments(), 'c1')!;
        expect(call.status).toBe('awaiting-approval');
        expect(callIn(subagentOf(call)!.segments, 'c2')!.status).toBe('awaiting-approval');

        c.run(...as('a2', { type: 'tool-approved', toolCallId: 'w1' }));
        const after = callIn(c.segments(), 'c1')!;
        expect(after.status).toBe('pending');
        expect(callIn(subagentOf(after)!.segments, 'c2')!.status).toBe('pending');
    });
});
