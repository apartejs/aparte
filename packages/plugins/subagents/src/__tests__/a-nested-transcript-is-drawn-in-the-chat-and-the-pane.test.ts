/**
 * A nested sub-agent's conversation is drawn in the chat AND in the view beside it, each in its
 * own element.
 *
 * With `details: 'transcript'`, sub-agent A's line in the chat holds A's conversation, and the
 * line of B (A's own sub-agent) inside it holds B's. Open A in a view beside the chat and B's line
 * is drawn there too. Both rows asked the transcript for B and got the ONE element cached for it,
 * so each update of either row moved it into that row: while B wrote, its conversation went back
 * and forth between the chat and the view, and one of the two was always empty.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { aparteGlobalConfig } from '@aparte/core';
import { setupSubagents } from '../index.js';
import { as, chat, frame } from './harness.js';

let stop: (() => void) | undefined;
afterEach(() => {
    document.body.innerHTML = '';
    stop?.();
    aparteGlobalConfig.reset();
});

const viewIn = (row: Element | null | undefined): HTMLElement | null =>
    row?.querySelector<HTMLElement>(':scope > .aparte-tool-detail > aparte-subagent-view, :scope > .aparte-tool-disclosure > .aparte-tool-detail > aparte-subagent-view') ?? null;

const rowIn = (view: Element | null, id: string): HTMLElement | null => {
    for (const child of view?.querySelector('.aparte-subagent-transcript')?.children ?? []) {
        if (child.getAttribute('data-segment-id') === id) return child as HTMLElement;
    }
    return null;
};

describe('a nested sub-agent drawn in the chat and in a view of its parent', () => {
    it('has its conversation in both, each in an element of its own, as it goes on', async () => {
        stop = setupSubagents({ details: 'transcript', open: 'event' });
        const c = chat({ id: 'chat' });
        c.run(
            { type: 'run-start' },
            { type: 'tool-start', toolCallId: 'c1', name: 'delegate', input: {} },
            { type: 'agent-start', agentId: 'a1', name: 'Lead', toolCallId: 'c1' },
            ...as('a1', { type: 'turn-start' }, { type: 'text-delta', delta: 'Delegating.' }, { type: 'tool-start', toolCallId: 'c2', name: 'delegate', input: {} }),
            { type: 'agent-start', agentId: 'a2', name: 'Grepper', parentAgentId: 'a1', toolCallId: 'c2' },
            ...as('a2', { type: 'turn-start' }, { type: 'text-delta', delta: 'Grandchild speaks.' }),
        );
        await frame();
        const pane = document.createElement('aparte-subagent-view');
        pane.setAttribute('for', 'chat');
        pane.setAttribute('message-id', 'a1');
        pane.setAttribute('agent-id', 'a1');
        document.body.append(pane);
        await frame();

        const inChat = () => viewIn(rowIn(viewIn(c.row('tool-c1')), 'tool-c2'));
        const inPane = () => viewIn(rowIn(pane, 'tool-c2'));
        expect(inChat(), 'in the chat').not.toBeNull();
        expect(inPane(), 'in the view').not.toBeNull();
        expect(inChat()).not.toBe(inPane());

        c.run(...as('a2', { type: 'text-delta', delta: ' Twice.' }));
        await frame();
        expect(inChat()?.textContent, 'in the chat, as it goes on').toContain('Grandchild speaks. Twice.');
        expect(inPane()?.textContent, 'in the view, as it goes on').toContain('Grandchild speaks. Twice.');

        // A config that changes (a language, an icon set, a tool registered) relabels every row.
        // The view relabelled outside its drawing, with no surface: the nested row asked for the
        // chat's element, and moved it into the view, leaving the chat's row empty.
        aparteGlobalConfig.setLocale('fr');
        await frame();
        expect(inChat(), 'still in the chat').not.toBeNull();
        expect(inPane(), 'still in the view').not.toBeNull();
        expect(inChat()).not.toBe(inPane());
        expect(inChat()?.textContent).toContain('Grandchild speaks. Twice.');
        expect(inPane()?.textContent).toContain('Grandchild speaks. Twice.');
    });
});
