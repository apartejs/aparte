/**
 * The view follows the stream elsewhere.
 *
 * `<aparte-subagent-view>` shows a sub-agent's conversation outside the chat — a canvas, a
 * pane, a dialog — named by the chat (`for`, or the `chat` property), the reply and the
 * agent. It follows the sub-agent live, picks it up when it starts after the view was
 * mounted, shows the saved conversation after a reload, follows a language switch, stops
 * once it is taken off the page, and draws nothing for a sub-agent it cannot find.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { aparteGlobalConfig, type AparteMessage } from '@aparte/core';
import { setupSubagents, type AparteSubagentView } from '../index.js';
import { as, chat, frame, type Chat } from './harness.js';

let stop: (() => void) | undefined;
afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = '';
    stop?.();
    aparteGlobalConfig.reset();
});

function mount(attrs: Record<string, string>, chatEl?: HTMLElement): AparteSubagentView {
    const view = document.createElement('aparte-subagent-view');
    for (const [name, value] of Object.entries(attrs)) view.setAttribute(name, value);
    if (chatEl) view.chat = chatEl;
    const pane = document.createElement('section');
    pane.append(view);
    document.body.append(pane);
    return view;
}

const start = (c: Chat): void => c.run(
    { type: 'run-start' },
    { type: 'tool-start', toolCallId: 'c1', name: 'delegate', input: {} },
    { type: 'agent-start', agentId: 'a1', name: 'Researcher', description: 'Read the parser', toolCallId: 'c1' },
    ...as('a1',
        { type: 'turn-start' },
        { type: 'text-delta', delta: 'Reading.' },
        { type: 'tool-start', toolCallId: 'r1', name: 'read_file', input: { path: 'parser.ts' } },
    ),
);

const ids = (view: HTMLElement): (string | null)[] =>
    [...view.querySelector('.aparte-subagent-transcript')!.children].map((r) => r.getAttribute('data-segment-id'));

describe('<aparte-subagent-view>', () => {
    it('follows a sub-agent live, by the chat\'s id', async () => {
        stop = setupSubagents();
        const c = chat();
        start(c);
        await frame();
        const view = mount({ for: 'chat-1', 'message-id': 'a1', 'agent-id': 'a1' });
        expect(view.hasAttribute('data-inline')).toBe(false);
        expect(view.hasAttribute('data-empty')).toBe(false);
        expect(view.querySelector('.aparte-subagent-task')!.textContent).toBe('Read the parser');
        expect(view.textContent).toContain('Reading.');
        expect(ids(view)).toContain('tool-r1');
        const first = view.querySelector('[data-segment-id="tool-r1"]');

        c.run(...as('a1',
            { type: 'tool-resolved', toolCallId: 'r1', result: 'ok' },
            { type: 'turn-start' },
            { type: 'text-delta', delta: 'Found it.' },
        ));
        await frame();
        expect(view.textContent).toContain('Found it.');
        expect(view.querySelector('[data-segment-id="tool-r1"]')).toBe(first);
        expect(first!.getAttribute('data-status')).toBe('resolved');
        // The reply's own line is untouched by the view.
        expect(c.row('tool-c1')!.querySelector('aparte-subagent-view')).toBeNull();
    });

    it('follows it by the `chat` property too', async () => {
        stop = setupSubagents();
        const c = chat();
        start(c);
        await frame();
        const view = mount({ 'message-id': 'a1', 'agent-id': 'a1' }, c.host);
        expect(view.chat).toBe(c.host);
        expect(view.textContent).toContain('Reading.');
        c.run(...as('a1', { type: 'text-delta', delta: ' More.' }));
        await frame();
        expect(view.textContent).toContain('More.');
    });

    it('mounted before the sub-agent starts, fills in when it does', async () => {
        stop = setupSubagents();
        const c = chat();
        const view = mount({ for: 'chat-1', 'message-id': 'a1', 'agent-id': 'a1' });
        expect(view.hasAttribute('data-empty')).toBe(true);
        expect(view.textContent).toBe('');
        start(c);
        await frame();
        expect(view.hasAttribute('data-empty')).toBe(false);
        expect(view.textContent).toContain('Reading.');
    });

    it('shows the saved conversation after a reload, settled', async () => {
        stop = setupSubagents();
        const before = chat({ id: 'before' });
        start(before);
        await frame();
        const saved = (JSON.parse(JSON.stringify(before.viewport.getMessages())) as AparteMessage[])
            .map((m) => ({ ...m, status: 'completed' as const, isStreaming: false }));
        before.host.remove();

        const c = chat({ messages: saved, id: 'after' });
        const view = mount({ for: 'after', 'message-id': 'a1', 'agent-id': 'a1' });
        expect(view.textContent).toContain('Reading.');
        expect(view.querySelector('[data-segment-id="tool-r1"]')!.getAttribute('data-status')).toBe('aborted');
        expect(c.row('tool-c1')).not.toBeNull();
    });

    it('reads stopped once the run is stopped', async () => {
        stop = setupSubagents();
        const c = chat();
        start(c);
        await frame();
        const view = mount({ for: 'chat-1', 'message-id': 'a1', 'agent-id': 'a1' });
        c.run({ type: 'run-aborted' });
        await frame();
        expect(view.querySelector('[data-segment-id="tool-r1"]')!.getAttribute('data-status')).toBe('aborted');
    });

    it('follows a language switch', async () => {
        stop = setupSubagents();
        const c = chat();
        start(c);
        c.run(...as('a1', { type: 'tool-resolved', toolCallId: 'r1', result: 'ok' }));
        await frame();
        const view = mount({ for: 'chat-1', 'message-id': 'a1', 'agent-id': 'a1' });
        const state = (): string | null | undefined =>
            view.querySelector('[data-segment-id="tool-r1"] .aparte-tool-state')?.textContent?.trim();
        expect(state()).toBe('Done');
        aparteGlobalConfig.extendLocale({ toolCompleted: 'Terminé' });
        expect(state()).toBe('Terminé');
    });

    it('re-reads when it is pointed at another sub-agent', async () => {
        stop = setupSubagents();
        const c = chat();
        start(c);
        c.run(
            { type: 'agent-start', agentId: 'p1', name: 'Planner' },
            ...as('p1', { type: 'turn-start' }, { type: 'text-delta', delta: 'Planning.' }),
        );
        await frame();
        const view = mount({ for: 'chat-1', 'message-id': 'a1', 'agent-id': 'a1' });
        expect(view.textContent).toContain('Reading.');
        view.setAttribute('agent-id', 'p1');
        expect(view.textContent).toContain('Planning.');
        expect(view.textContent).not.toContain('Reading.');
    });

    it('stops following once it is taken off the page, and cleans up its rows', async () => {
        stop = setupSubagents();
        const c = chat();
        start(c);
        await frame();
        const view = mount({ for: 'chat-1', 'message-id': 'a1', 'agent-id': 'a1' });
        expect(view.textContent).toContain('Reading.');
        view.remove();
        await Promise.resolve();
        c.run(...as('a1', { type: 'turn-start' }, { type: 'text-delta', delta: 'Unseen.' }));
        await frame();
        expect(view.textContent).not.toContain('Unseen.');
        expect(ids(view)).toEqual([]);

        // Put back, it reads the sub-agent again.
        document.body.append(view);
        expect(view.textContent).toContain('Unseen.');
    });

    it('draws nothing for an agent it cannot find, and says so once to the developer', async () => {
        stop = setupSubagents();
        const before = chat({ id: 'before' });
        start(before);
        await frame();
        const saved = (JSON.parse(JSON.stringify(before.viewport.getMessages())) as AparteMessage[])
            .map((m) => ({ ...m, status: 'completed' as const, isStreaming: false }));
        before.host.remove();
        chat({ messages: saved, id: 'after' });

        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const view = mount({ for: 'after', 'message-id': 'a1', 'agent-id': 'nobody' });
        view.refresh();
        expect(view.hasAttribute('data-empty')).toBe(true);
        expect(view.textContent).toBe('');
        expect(warn).toHaveBeenCalledTimes(1);
        expect(String(warn.mock.calls[0]![0])).toContain('nobody');

        // A chat it cannot find, or a reply not there yet: nothing, and nothing said.
        const lost = mount({ for: 'nowhere', 'message-id': 'a1', 'agent-id': 'a1' });
        const early = mount({ for: 'after', 'message-id': 'later', 'agent-id': 'a1' });
        expect(lost.textContent).toBe('');
        expect(early.textContent).toBe('');
        expect(warn).toHaveBeenCalledTimes(1);
    });
});
