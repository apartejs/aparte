/**
 * `connectSubagentView`: a sub-agent's line opens its conversation in a view beside the chat.
 *
 * The line's Open says "open this"; the wiring points the view at that sub-agent, opens the
 * split's second pane and marks the line, so a reader sees which one is shown. Close, or
 * Escape in the view, folds the pane, clears the mark and gives the focus back to the button
 * that opened it. On a phone (the split stacked) it is the same two properties: the split
 * shows the view's pane, then the chat's again. The returned function undoes all of it.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { aparteGlobalConfig } from '@aparte/core';
import { connectSubagentView, setupSubagents, type AparteSubagentView, type SubagentViewSplit } from '../index.js';
import { as, chat, frame } from './harness.js';

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

/** A reply with two sub-agents, the second still working; a view and a split beside the chat. */
async function setUp(options: { split?: boolean } = {}) {
    stop = setupSubagents({ open: 'event' });
    const c = chat();
    c.run(
        { type: 'run-start' },
        { type: 'tool-start', toolCallId: 'c1', name: 'delegate', input: {} },
        { type: 'agent-start', agentId: 'a1', name: 'Researcher', description: 'Read the parser', toolCallId: 'c1' },
        ...as('a1', { type: 'turn-start' }, { type: 'text-delta', delta: 'The parser is fine.' }),
        { type: 'agent-end', agentId: 'a1', status: 'done', result: 'fine' },
        { type: 'tool-start', toolCallId: 'c2', name: 'delegate', input: {} },
        { type: 'agent-start', agentId: 'a2', name: 'Tester', description: 'Run the tests', toolCallId: 'c2' },
        ...as('a2', { type: 'turn-start' }, { type: 'text-delta', delta: 'Running' }),
    );
    await frame();
    const view = document.createElement('aparte-subagent-view') as AparteSubagentView;
    let split: SubagentViewSplit | undefined;
    if (options.split !== false) {
        split = document.createElement('aparte-split') as SubagentViewSplit;
        document.body.append(split);
        split.append(c.host, view);
    } else {
        document.body.append(view);
    }
    disconnect = connectSubagentView({ chat: c.host, view, ...(split ? { split } : {}) });
    return { c, view, split };
}

describe('connectSubagentView', () => {
    it('starts with the chat alone, and makes the view closable', async () => {
        const { view, split } = await setUp();
        expect(split!.single).toBe(true);
        expect(split!.pane).toBe('start');
        expect(view.hasAttribute('closable')).toBe(true);
        expect(view.chat).not.toBeNull();
    });

    it("opens the view's pane on the sub-agent whose line was pressed, and marks that line", async () => {
        const { c, view, split } = await setUp();
        const row = c.row('tool-c1')!;
        openButton(row)!.click();
        expect(view.getAttribute('message-id')).toBe('a1');
        expect(view.getAttribute('agent-id')).toBe('a1');
        expect(split!.single).toBe(false);
        expect(split!.pane).toBe('end');
        expect(row.hasAttribute('data-current')).toBe(true);
        expect(openButton(row)!.getAttribute('aria-current')).toBe('true');
        // The view reads it, with its name in the head, which takes the focus.
        await frame();
        expect(view.hasAttribute('data-empty')).toBe(false);
        expect(view.textContent).toContain('The parser is fine.');
        const name = view.querySelector<HTMLElement>('.aparte-subagent-name')!;
        expect(name.textContent).toBe('Researcher');
        expect(document.activeElement).toBe(name);
    });

    it('moves the mark when another line is pressed', async () => {
        const { c } = await setUp();
        openButton(c.row('tool-c1'))!.click();
        openButton(c.row('tool-c2'))!.click();
        expect(c.row('tool-c1')!.hasAttribute('data-current')).toBe(false);
        expect(openButton(c.row('tool-c1'))!.hasAttribute('aria-current')).toBe(false);
        expect(c.row('tool-c2')!.hasAttribute('data-current')).toBe(true);
    });

    it('keeps the mark on a line drawn again while it is shown', async () => {
        const { c } = await setUp();
        openButton(c.row('tool-c2'))!.click();
        // The sub-agent goes on working: its line is updated, and still says it is the one open.
        c.run(...as('a2', { type: 'tool-start', toolCallId: 'r1', name: 'run_command', input: { cmd: 'pnpm test' } }));
        await frame();
        expect(c.row('tool-c2')!.hasAttribute('data-current')).toBe(true);
    });

    it('follows the sub-agent live while it works', async () => {
        const { c, view } = await setUp();
        openButton(c.row('tool-c2'))!.click();
        await frame();
        expect(view.textContent).toContain('Running');
        c.run(...as('a2', { type: 'text-delta', delta: ' the tests now' }));
        await frame();
        expect(view.textContent).toContain('Running the tests now');
    });

    it('folds the pane on Close, clears the mark and gives the focus back to the button', async () => {
        const { c, view, split } = await setUp();
        const button = openButton(c.row('tool-c1'))!;
        button.click();
        view.querySelector<HTMLButtonElement>('.aparte-subagent-close')!.click();
        expect(split!.single).toBe(true);
        expect(split!.pane).toBe('start');
        expect(c.row('tool-c1')!.hasAttribute('data-current')).toBe(false);
        expect(document.activeElement).toBe(button);
    });

    it('gives the focus back to the same line drawn again while the view was open', async () => {
        const { c, view } = await setUp();
        const row = c.row('tool-c2')!;
        openButton(row)!.click();
        // A framework drew the reply again: the line is another element now.
        const again = row.cloneNode(true) as HTMLElement;
        row.replaceWith(again);
        view.querySelector<HTMLButtonElement>('.aparte-subagent-close')!.click();
        expect(document.activeElement).toBe(openButton(again));
    });

    it('gives the focus to the composer when the line that opened the view is gone', async () => {
        const { c, view } = await setUp();
        const input = document.createElement('aparte-composer-input');
        c.host.append(input);
        openButton(c.row('tool-c1'))!.click();
        // The reply was drawn again without that sub-agent's line: nothing to go back to.
        c.row('tool-c1')!.remove();
        view.querySelector<HTMLButtonElement>('.aparte-subagent-close')!.click();
        expect(document.activeElement).not.toBe(document.body);
        expect(input.contains(document.activeElement)).toBe(true);
    });

    it('leaves the focus where the reader moved it when the line that opened the view is gone', async () => {
        const { c, view } = await setUp();
        c.host.append(document.createElement('aparte-composer-input'));
        const elsewhere = document.createElement('button');
        document.body.append(elsewhere);
        openButton(c.row('tool-c1'))!.click();
        elsewhere.focus();
        c.row('tool-c1')!.remove();
        view.querySelector<HTMLButtonElement>('.aparte-subagent-close')!.click();
        expect(document.activeElement).toBe(elsewhere);
    });

    it("reads a working sub-agent from its lane's last write when the chat does not hold it yet", async () => {
        const { view } = await setUp({ split: false });
        // A chat a framework mirrors, a step behind: the reply is there, its sub-agents not yet.
        view.chat = { id: 'chat-1', getMessages: () => [{ id: 'a1', role: 'assistant', content: '', timestamp: 2, segments: [] }] };
        view.setAttribute('message-id', 'a1');
        view.setAttribute('agent-id', 'a2');
        expect(view.hasAttribute('data-empty')).toBe(false);
        expect(view.textContent).toContain('Running');
    });

    it('folds the pane on Escape inside the view', async () => {
        const { c, view, split } = await setUp();
        openButton(c.row('tool-c1'))!.click();
        view.querySelector('.aparte-subagent-name')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
        expect(split!.single).toBe(true);
    });

    it('on a phone, shows the view pane and then the chat again: the same two properties', async () => {
        const { c, split } = await setUp();
        // Stacked: one pane at a time, the one `pane` names.
        split!.setAttribute('breakpoint', '100000px');
        openButton(c.row('tool-c1'))!.click();
        expect(split!.pane).toBe('end');
        expect(split!.single).toBe(false);
        document.querySelector('aparte-subagent-view')!.querySelector<HTMLButtonElement>('.aparte-subagent-close')!.click();
        expect(split!.pane).toBe('start');
    });

    it('without a split, leaves the layout to onOpen and onClose', async () => {
        stop = setupSubagents({ open: 'event' });
        const c = chat();
        c.run(
            { type: 'run-start' },
            { type: 'tool-start', toolCallId: 'c1', name: 'delegate', input: {} },
            { type: 'agent-start', agentId: 'a1', name: 'Researcher', toolCallId: 'c1' },
        );
        await frame();
        const view = document.createElement('aparte-subagent-view') as AparteSubagentView;
        document.body.append(view);
        const calls: string[] = [];
        disconnect = connectSubagentView({
            chat: c.host,
            view,
            onOpen: (detail) => calls.push(`open ${detail.agentId}`),
            onClose: () => calls.push('close'),
        });
        openButton(c.row('tool-c1'))!.click();
        view.querySelector<HTMLButtonElement>('.aparte-subagent-close')!.click();
        expect(calls).toEqual(['open a1', 'close']);
    });

    it("opens a sub-agent's own sub-agent, drawn as a line in the view, in the same view", async () => {
        stop = setupSubagents({ open: 'event' });
        const c = chat();
        c.run(
            { type: 'run-start' },
            { type: 'tool-start', toolCallId: 'c1', name: 'delegate', input: {} },
            { type: 'agent-start', agentId: 'a1', name: 'Lead', toolCallId: 'c1' },
            ...as('a1', { type: 'turn-start' }, { type: 'tool-start', toolCallId: 'n1', name: 'delegate', input: {} }),
            { type: 'agent-start', agentId: 'a2', name: 'Helper', toolCallId: 'n1', parentAgentId: 'a1' },
            ...as('a2', { type: 'turn-start' }, { type: 'text-delta', delta: 'Helping' }),
        );
        await frame();
        const view = document.createElement('aparte-subagent-view') as AparteSubagentView;
        document.body.append(view);
        disconnect = connectSubagentView({ chat: c.host, view });
        openButton(c.row('tool-c1'))!.click();
        await frame();
        const nested = view.querySelector<HTMLElement>('[data-segment-id="tool-n1"]')!;
        expect(nested).not.toBeNull();
        openButton(nested)!.click();
        expect(view.getAttribute('agent-id')).toBe('a2');
        await frame();
        expect(view.textContent).toContain('Helping');
    });

    it('folds when another conversation is loaded', async () => {
        const { c, split } = await setUp();
        openButton(c.row('tool-c1'))!.click();
        c.host.dispatchEvent(new CustomEvent('aparte-conversation-loaded', { bubbles: true }));
        expect(split!.single).toBe(true);
        expect(c.row('tool-c1')!.hasAttribute('data-current')).toBe(false);
    });

    it('undoes all of it when disconnected', async () => {
        const { c, view, split } = await setUp();
        disconnect!();
        disconnect = undefined;
        expect(view.hasAttribute('closable')).toBe(false);
        split!.single = true;
        openButton(c.row('tool-c1'))!.click();
        expect(split!.single).toBe(true);
        expect(view.hasAttribute('agent-id')).toBe(false);
        expect(c.row('tool-c1')!.hasAttribute('data-current')).toBe(false);
    });
});
