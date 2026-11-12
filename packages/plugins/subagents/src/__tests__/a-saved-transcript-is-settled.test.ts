/**
 * A saved transcript is settled.
 *
 * A conversation saved while a sub-agent worked comes back with nobody to finish it. Its
 * lane is adopted before it is drawn: nothing in it reads as arriving (no shimmer on its
 * reasoning, no spinner on its calls), and the call it had open reads stopped — as the
 * reply's own open call does.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { aparteGlobalConfig, type AparteMessage } from '@aparte/core';
import { setupSubagents, subagentOf } from '../index.js';
import { as, callIn, chat, frame } from './harness.js';

let stop: (() => void) | undefined;
afterEach(() => {
    document.body.innerHTML = '';
    stop?.();
    aparteGlobalConfig.reset();
});

/** The reply `a1` as a store saves it mid-run: one sub-agent thinking, one call open. */
async function savedMidRun(): Promise<AparteMessage[]> {
    const c = chat({ id: 'before' });
    c.run(
        { type: 'run-start' },
        { type: 'tool-start', toolCallId: 'c1', name: 'delegate', input: {} },
        { type: 'agent-start', agentId: 'a1', name: 'Researcher', description: 'Read the parser', toolCallId: 'c1' },
        ...as('a1',
            { type: 'turn-start' },
            { type: 'tool-start', toolCallId: 'r1', name: 'read_file', input: { path: 'parser.ts' } },
            { type: 'thinking-delta', delta: 'Where is the parser?' },
        ),
        { type: 'agent-start', agentId: 'p1', name: 'Planner', description: 'Plan the fix' },
        ...as('p1', { type: 'turn-start' }, { type: 'text-delta', delta: 'Planning.' }),
    );
    await frame();
    const saved = (JSON.parse(JSON.stringify(c.viewport.getMessages())) as AparteMessage[])
        .map((m) => ({ ...m, status: 'completed' as const, isStreaming: false }));
    c.host.remove();
    return saved;
}

const viewIn = (row: Element | null): HTMLElement =>
    row!.querySelector<HTMLElement>(':scope > .aparte-tool-detail > aparte-subagent-view')!;

describe('a saved transcript', () => {
    it('reads stopped: its open call aborted, nothing arriving', async () => {
        stop = setupSubagents({ details: 'transcript' });
        const saved = await savedMidRun();
        // Saved as it was: the child's call still open, its reasoning still arriving.
        const lane = subagentOf(callIn(saved[1]!.segments!, 'c1')!)!;
        expect(callIn(lane.segments, 'r1')!.status).toBe('pending');
        expect(lane.segments.some((s) => s.isStreaming === true)).toBe(true);

        const c = chat({ messages: saved, id: 'after' });
        const view = viewIn(c.row('tool-c1'));
        expect(view.querySelector('.aparte-subagent-task')!.textContent).toBe('Read the parser');
        const call = view.querySelector<HTMLElement>('[data-segment-id="tool-r1"]')!;
        expect(call.getAttribute('data-status')).toBe('aborted');
        expect(view.querySelector('.aparte-thinking-label')!.classList.contains('aparte-shimmer')).toBe(false);
        expect(view.querySelector('.aparte-shimmer')).toBeNull();
    });

    it("reads stopped under a plugin segment's line too", async () => {
        stop = setupSubagents({ details: 'transcript' });
        const saved = await savedMidRun();
        const c = chat({ messages: saved, id: 'after' });
        const view = viewIn(c.row('subagent-p1'));
        expect(view.textContent).toContain('Planning.');
        expect(view.querySelector('.aparte-shimmer')).toBeNull();
    });
});
