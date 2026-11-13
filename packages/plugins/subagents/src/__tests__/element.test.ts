/**
 * `<aparte-subagent-view>` is a well-behaved element: defined once, typed by its tag,
 * reading its three attributes, waiting inside a `defer-hydration` root, and putting the
 * plugin's sheet on the page once.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { aparteGlobalConfig, releaseDeferredHydration, type AparteMessage } from '@aparte/core';
import { AparteSubagentView, setupSubagents } from '../index.js';
import { as, chat, frame } from './harness.js';

let stop: (() => void) | undefined;
afterEach(() => {
    document.body.innerHTML = '';
    stop?.();
    aparteGlobalConfig.reset();
});

describe('<aparte-subagent-view> as an element', () => {
    it("puts the plugin's sheet on the page once, the view first then the renderer", () => {
        const sheets = (): number =>
            [...document.querySelectorAll('style')].filter((s) => s.textContent?.includes('.aparte-subagent-transcript')).length;
        document.body.append(document.createElement('aparte-subagent-view'));
        expect(sheets()).toBe(1);
        // The renderer's sheet goes on the page as the setup registers it.
        stop = setupSubagents();
        document.body.append(document.createElement('aparte-subagent-view'));
        expect(sheets()).toBe(1);
    });

    it('is defined once, and its tag names its class', async () => {
        expect(customElements.get('aparte-subagent-view')).toBe(AparteSubagentView);
        // Importing the module again defines nothing twice.
        await import('../aparte-subagent-view.js');
        expect(customElements.get('aparte-subagent-view')).toBe(AparteSubagentView);
        const view: AparteSubagentView = document.createElement('aparte-subagent-view');
        expect(view).toBeInstanceOf(AparteSubagentView);
        expect(AparteSubagentView.observedAttributes).toEqual(['for', 'message-id', 'agent-id', 'closable']);
    });

    it('re-reads when its chat changes', async () => {
        stop = setupSubagents();
        const one = chat({ id: 'one' });
        one.run(
            { type: 'run-start' },
            { type: 'agent-start', agentId: 'x', name: 'First' },
            ...as('x', { type: 'turn-start' }, { type: 'text-delta', delta: 'In the first chat.' }),
        );
        // The second chat holds a saved reply with the same ids.
        chat({
            id: 'two',
            messages: [{
                id: 'a1', role: 'assistant', content: '', timestamp: 1, status: 'completed',
                segments: [{
                    id: 'subagent-x', type: 'subagent',
                    subagent: { id: 'x', name: 'Second', status: 'done', segments: [{ id: 't1', type: 'text', content: 'In the second chat.' }] },
                }],
            } as AparteMessage],
        });
        await frame();
        const view = document.createElement('aparte-subagent-view');
        view.setAttribute('message-id', 'a1');
        view.setAttribute('agent-id', 'x');
        view.setAttribute('for', 'one');
        document.body.append(view);
        expect(view.textContent).toContain('In the first chat.');
        view.setAttribute('for', 'two');
        expect(view.textContent).toContain('In the second chat.');
        expect(view.textContent).not.toContain('first');
        // Only its own chat's writes reach it.
        one.run(...as('x', { type: 'text-delta', delta: ' Elsewhere.' }));
        await frame();
        expect(view.textContent).not.toContain('Elsewhere');
    });

    it('waits inside a defer-hydration root, and draws once it is released', async () => {
        stop = setupSubagents();
        const c = chat();
        c.run(
            { type: 'run-start' },
            { type: 'agent-start', agentId: 'x', name: 'Planner' },
            ...as('x', { type: 'turn-start' }, { type: 'text-delta', delta: 'Planning.' }),
        );
        await frame();
        const root = document.createElement('div');
        root.setAttribute('defer-hydration', '');
        const view = document.createElement('aparte-subagent-view');
        view.setAttribute('for', 'chat-1');
        view.setAttribute('message-id', 'a1');
        view.setAttribute('agent-id', 'x');
        root.append(view);
        document.body.append(root);
        expect(view.childElementCount).toBe(0);
        releaseDeferredHydration(root);
        expect(view.textContent).toContain('Planning.');
    });
});
