/**
 * A sub-agent without a call gets the same line.
 *
 * An agent announced with no call that opened it (an AG-UI `SUBAGENT_STARTED` without a
 * parent call) has no row in the reply, so the plugin adds a `subagent` segment — drawn by
 * core's own tool row, for a call that stands in for the agent: the same markup, the same
 * states, and every lever of `registerToolDisplay`, by the agent's name.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { aparteGlobalConfig, registerSegmentRenderer, unregisterSegmentRenderer, type AparteToolCallSegment } from '@aparte/core';
import { setupSubagents, subagentOf, subagentStatus, type AparteSubagentSegment, type AparteSubagentStartEventDetail } from '../index.js';
import { standInCall } from '../segment.js';
import { as, chat, shown } from './harness.js';

let stop: (() => void) | undefined;
afterEach(() => {
    document.body.innerHTML = '';
    stop?.();
    aparteGlobalConfig.reset();
});

function planner(name: string | null = 'Planner') {
    // One chat at a time: a setup replaced under a chat still on screen redraws it without its renderer.
    document.body.innerHTML = '';
    stop?.();
    stop = setupSubagents();
    const c = chat();
    const started: AparteSubagentStartEventDetail[] = [];
    c.host.addEventListener('aparte-subagent-start', (e) => started.push(e.detail));
    c.run(
        { type: 'run-start' },
        { type: 'agent-start', agentId: 'a1', ...(name ? { name } : {}), description: 'Plan the fix' },
        ...as('a1', { type: 'turn-start' }, { type: 'tool-start', toolCallId: 'g1', name: 'grep', input: {} }),
    );
    return { c, started };
}

describe('a sub-agent without a call', () => {
    it("gets a segment of the plugin's own, drawn as core's tool row and named by the agent", () => {
        const { c, started } = planner();
        const segment = c.segment('subagent-a1')!;
        expect(segment.type).toBe('subagent');
        expect(segment.isStreaming).toBe(true);
        expect(subagentOf(segment)).toMatchObject({ id: 'a1', name: 'Planner', status: 'running' });
        const row = c.row('subagent-a1')!;
        // Core's row, its root returned as is: no wrapper around it.
        expect(row.classList.contains('aparte-segment-tool-call')).toBe(true);
        expect(row.getAttribute('data-tool-name')).toBe('Planner');
        expect(row.getAttribute('data-status')).toBe('pending');
        expect(row.parentElement!.classList.contains('aparte-segment-tool-call')).toBe(false);
        expect(shown(row, 'name')).toBe('Planner');
        expect(shown(row, 'target')).toBe('Plan the fix');
        expect(shown(row, 'activity')).toBe('grep');
        expect(started).toEqual([{ targetId: 'chat-1', messageId: 'a1', agentId: 'a1', name: 'Planner', description: 'Plan the fix' }]);
    });

    it('reads each state as a call would: done, failed with its error, stopped', () => {
        const { c } = planner();
        c.run({ type: 'agent-end', agentId: 'a1', status: 'failed', error: 'The model refused.' });
        const segment = c.segment('subagent-a1')!;
        expect(segment.isStreaming).toBe(false);
        expect(subagentStatus(segment)).toBe('failed');
        const row = c.row('subagent-a1')!;
        expect(row.getAttribute('data-status')).toBe('failed');
        expect(shown(row, 'state')).toBe('Failed');
        // No word of the plugin's own: the row's badge already says it.
        expect(shown(row, 'note') ?? '').not.toMatch(/Failed/);
        expect(shown(row, 'activity')).toMatch(/^1 tool · /);

        const done = planner();
        done.c.run({ type: 'agent-end', agentId: 'a1', status: 'done' });
        expect(done.c.row('subagent-a1')!.getAttribute('data-status')).toBe('resolved');

        const stopped = planner();
        stopped.c.run({ type: 'run-aborted' });
        expect(subagentStatus(stopped.c.segment('subagent-a1')!)).toBe('stopped');
        expect(shown(stopped.c.row('subagent-a1'), 'state')).toBe('Stopped');
    });

    it("the app's display for the agent's name applies: its label, and hidden", () => {
        aparteGlobalConfig.registerToolDisplay('Planner', { label: 'Plan', quiet: false });
        const { c } = planner();
        const row = c.row('subagent-a1')!;
        expect(shown(row, 'name')).toBe('Plan');
        expect(row.hasAttribute('data-quiet')).toBe(false);

        aparteGlobalConfig.registerToolDisplay('Planner', { hidden: true });
        const hidden = planner();
        expect(hidden.c.row('subagent-a1')!.hidden).toBe(true);
    });

    it("an app's own row for calls draws it too, drawn again on each change when it cannot patch", () => {
        const drawn: string[] = [];
        registerSegmentRenderer<AparteToolCallSegment>({
            type: 'tool_call',
            render: (segment) => {
                drawn.push(segment.status);
                const el = document.createElement('div');
                el.className = 'app-row';
                el.textContent = `${segment.toolCall.name}: ${segment.status}`;
                return el;
            },
        });
        try {
            const { c } = planner();
            expect(c.row('subagent-a1')!.textContent).toBe('Planner: pending');
            c.run({ type: 'agent-end', agentId: 'a1', status: 'done' });
            expect(c.row('subagent-a1')!.textContent).toBe('Planner: resolved');
            expect(c.row('subagent-a1')!.classList.contains('app-row')).toBe(true);
            // Removed: its row goes with it.
            (c.viewport as unknown as { removeSegment(m: string, s: string): void }).removeSegment('a1', 'subagent-a1');
            expect(c.row('subagent-a1')).toBeNull();
            expect(drawn).toContain('resolved');
        } finally {
            document.body.innerHTML = '';
            unregisterSegmentRenderer('tool_call');
        }
    });

    it('a stand-in for a bare segment carries only what the segment has', () => {
        const bare = { id: 'subagent-x', type: 'subagent', subagent: { id: 'x', status: 'failed', error: 'boom', segments: [] } } as AparteSubagentSegment;
        const call = standInCall(bare);
        expect(call).toMatchObject({ id: 'subagent-x', status: 'failed', result: 'boom', toolCall: { id: 'x', name: 'subagent', input: {} } });
        expect('messageId' in call || 'index' in call || 'meta' in call || 'collapsed' in call).toBe(false);
        const open = standInCall({ ...bare, collapsed: false, subagent: { id: 'x', status: 'done', segments: [] } } as AparteSubagentSegment);
        expect(open).toMatchObject({ collapsed: false, status: 'resolved' });
        expect('result' in open).toBe(false);
    });

    it('an agent with no name reads "Sub-agent"', () => {
        const { c } = planner(null);
        expect(shown(c.row('subagent-a1'), 'name')).toBe('Sub-agent');
    });

    it('follows a language switch', () => {
        const { c } = planner(null);
        aparteGlobalConfig.extendLocale({ tag: 'fr' });
        expect(shown(c.row('subagent-a1'), 'name')).toBe('Sous-agent');
    });
});
