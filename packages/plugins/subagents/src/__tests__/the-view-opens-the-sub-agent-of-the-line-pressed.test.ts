/**
 * The view opens the sub-agent of the line that was pressed, even when two sub-agents of the
 * reply share an id.
 *
 * A backend that mints sub-agent ids per run names a resume's first one like the paused run's,
 * and the plugin gives each its own line (see a-sub-agent-on-another-call-is-a-new-one). Open on
 * the second line still showed the FIRST: the view looked the id up and took the first match
 * in the reply, and both lines read as the one shown. The line pressed names its call; the view
 * opens that one, and only that line is marked.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { aparteGlobalConfig, type AparteStreamRunEvent } from '@aparte/core';
import { connectSubagentView, setupSubagents, type AparteSubagentView } from '../index.js';
import { as, chat, frame, type Chat } from './harness.js';

let stop: (() => void) | undefined;
let disconnect: (() => void) | undefined;
afterEach(() => {
    disconnect?.();
    disconnect = undefined;
    document.body.innerHTML = '';
    stop?.();
    aparteGlobalConfig.reset();
});

const openButton = (row: Element | null): HTMLButtonElement | null =>
    row?.querySelector<HTMLButtonElement>(':scope > :is(.aparte-tool-line, .aparte-tool-open-slot) > .aparte-tool-open') ?? null;

const delegated = (call: string, name: string, words: string): AparteStreamRunEvent[] => [
    { type: 'turn-start' },
    { type: 'tool-start', toolCallId: call, name: 'delegate', input: {} },
    { type: 'agent-start', agentId: 'agent-0', name, toolCallId: call },
    ...as('agent-0', { type: 'turn-start' }, { type: 'text-delta', delta: words }, { type: 'text-flush' }),
    { type: 'agent-end', agentId: 'agent-0', status: 'done', result: words },
    { type: 'tool-resolved', toolCallId: call, result: words },
];

/** Two sub-agents named `agent-0`, one before a pause on c1, one after it on c3. */
function twoUnderOneId(c: Chat): void {
    c.run(
        { type: 'run-start' },
        ...delegated('c1', 'first', 'From the first.'),
        { type: 'tool-start', toolCallId: 'd1', name: 'delete_file', input: {} },
        { type: 'tool-awaiting-approval', toolCallId: 'd1', name: 'delete_file', input: {} },
        { type: 'run-suspended', pending: [{ toolCallId: 'd1', name: 'delete_file', input: {}, reason: 'approval' }] },
    );
    const resumed = c.again();
    for (const e of [
        { type: 'run-start' },
        { type: 'tool-resolved', toolCallId: 'd1', result: 'deleted' },
        ...delegated('c3', 'second', 'From the second.'),
        { type: 'run-done' },
    ] as AparteStreamRunEvent[]) resumed(e);
}

describe('two sub-agents of one reply under one id', () => {
    it('Open on the second line shows the second, and marks that line only', async () => {
        stop = setupSubagents({ open: 'event' });
        const c = chat();
        twoUnderOneId(c);
        await frame();
        const view = document.createElement('aparte-subagent-view') as AparteSubagentView;
        document.body.append(view);
        disconnect = connectSubagentView({ chat: c.host, view });

        openButton(c.row('tool-c3'))!.click();
        await frame();
        expect(view.textContent).toContain('From the second.');
        expect(view.textContent).not.toContain('From the first.');
        expect(openButton(c.row('tool-c3'))!.getAttribute('aria-current')).toBe('true');
        expect(openButton(c.row('tool-c1'))!.hasAttribute('aria-current')).toBe(false);

        // And back to the first.
        openButton(c.row('tool-c1'))!.click();
        await frame();
        expect(view.textContent).toContain('From the first.');
        expect(view.textContent).not.toContain('From the second.');
    });
});
