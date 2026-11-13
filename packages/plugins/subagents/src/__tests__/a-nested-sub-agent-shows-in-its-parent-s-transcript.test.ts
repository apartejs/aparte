/**
 * A nested sub-agent shows in its parent's transcript.
 *
 * A sub-agent of a sub-agent is a line in its parent's conversation — on the parent's call
 * that opened it, or on a segment of the plugin's own — and that line opens on its own
 * conversation in turn. A view pointed at it finds it through its parent's lane, live and
 * after a reload.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { aparteGlobalConfig, type AparteMessage } from '@aparte/core';
import { setupSubagents } from '../index.js';
import { as, chat, frame, shown, type Chat } from './harness.js';

let stop: (() => void) | undefined;
afterEach(() => {
    document.body.innerHTML = '';
    stop?.();
    aparteGlobalConfig.reset();
});

const run = (c: Chat): void => c.run(
    { type: 'run-start' },
    { type: 'tool-start', toolCallId: 'c1', name: 'delegate', input: {} },
    { type: 'agent-start', agentId: 'a1', name: 'Lead', description: 'Fix the parser', toolCallId: 'c1' },
    ...as('a1', { type: 'turn-start' }, { type: 'text-delta', delta: 'Delegating.' }, { type: 'tool-start', toolCallId: 'c2', name: 'delegate', input: {} }),
    { type: 'agent-start', agentId: 'a2', name: 'Grepper', description: 'Find the callers', parentAgentId: 'a1', toolCallId: 'c2' },
    ...as('a2', { type: 'turn-start' }, { type: 'text-delta', delta: 'Grandchild speaks.' }),
    { type: 'agent-start', agentId: 'a3', name: 'Reader', description: 'Read the tests', parentAgentId: 'a1' },
    ...as('a3', { type: 'turn-start' }, { type: 'text-delta', delta: 'Another grandchild.' }),
);

const viewIn = (row: Element | null | undefined): HTMLElement | null =>
    row?.querySelector<HTMLElement>(':scope > .aparte-tool-detail > aparte-subagent-view') ?? null;

const rowIn = (view: HTMLElement | null, id: string): HTMLElement | null => {
    for (const child of view?.querySelector('.aparte-subagent-transcript')?.children ?? []) {
        if (child.getAttribute('data-segment-id') === id) return child as HTMLElement;
    }
    return null;
};

describe("a nested sub-agent in its parent's transcript", () => {
    it('is a line there, on the call that opened it or on its own segment, and opens on its own conversation', async () => {
        stop = setupSubagents({ details: 'transcript' });
        const c = chat();
        run(c);
        await frame();

        const lead = viewIn(c.row('tool-c1'))!;
        expect(lead.textContent).toContain('Delegating.');

        const onCall = rowIn(lead, 'tool-c2')!;
        expect(shown(onCall, 'name')).toBe('Grepper');
        expect(shown(onCall, 'target')).toBe('Find the callers');
        const grepper = viewIn(onCall)!;
        expect(grepper.textContent).toContain('Grandchild speaks.');

        const own = rowIn(lead, 'subagent-a3')!;
        expect(own.classList.contains('aparte-segment-tool-call')).toBe(true);
        expect(shown(own, 'name')).toBe('Reader');
        expect(viewIn(own)!.textContent).toContain('Another grandchild.');

        // Live, the nested conversation is completed in place too.
        c.run(...as('a2', { type: 'text-delta', delta: ' Twice.' }));
        await frame();
        expect(viewIn(rowIn(viewIn(c.row('tool-c1')), 'tool-c2'))).toBe(grepper);
        expect(grepper.textContent).toContain('Grandchild speaks. Twice.');
    });

    it('a view finds it through its parent, live and after a reload', async () => {
        stop = setupSubagents();
        const c = chat({ id: 'before' });
        run(c);
        await frame();
        const live = document.createElement('aparte-subagent-view');
        live.setAttribute('for', 'before');
        live.setAttribute('message-id', 'a1');
        live.setAttribute('agent-id', 'a2');
        document.body.append(live);
        expect(live.querySelector('.aparte-subagent-task')!.textContent).toBe('Find the callers');
        expect(live.textContent).toContain('Grandchild speaks.');
        c.run(...as('a2', { type: 'text-delta', delta: ' Again.' }));
        await frame();
        expect(live.textContent).toContain('Grandchild speaks. Again.');

        const saved = (JSON.parse(JSON.stringify(c.viewport.getMessages())) as AparteMessage[])
            .map((m) => ({ ...m, status: 'completed' as const, isStreaming: false }));
        c.host.remove();
        live.remove();
        chat({ messages: saved, id: 'after' });
        const view = document.createElement('aparte-subagent-view');
        view.setAttribute('for', 'after');
        view.setAttribute('message-id', 'a1');
        view.setAttribute('agent-id', 'a3');
        document.body.append(view);
        expect(view.textContent).toContain('Another grandchild.');
    });
});
