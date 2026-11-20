/**
 * The mark of the sub-agent shown elsewhere goes on its own line's Open button, never on a
 * nested line's.
 *
 * A line whose detail is a transcript wraps its disclosure, and its Open button sits in a slot
 * AFTER it. The transcript holds the nested sub-agents' lines, each with an Open button of its
 * own, which come first in document order. Found without `:scope`, the nested button was marked
 * `aria-current` while the outer sub-agent was the one shown, and unmarking left the outer one
 * marked. No test nested a sub-agent line under a line with a transcript, so nothing saw it.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { aparteGlobalConfig } from '@aparte/core';
import { setupSubagents } from '../index.js';
import { markRow, openButtonOf } from '../open.js';
import { as, chat, frame } from './harness.js';

let stop: (() => void) | undefined;
afterEach(() => {
    document.body.innerHTML = '';
    stop?.();
    aparteGlobalConfig.reset();
});

describe('a line with a transcript that holds a nested sub-agent line', () => {
    it('marks and unmarks its own Open button, and leaves the nested one alone', async () => {
        stop = setupSubagents({ details: 'transcript', open: 'event' });
        const c = chat();
        c.run(
            { type: 'run-start' },
            { type: 'tool-start', toolCallId: 'c1', name: 'delegate', input: {} },
            { type: 'agent-start', agentId: 'a1', name: 'Lead', toolCallId: 'c1' },
            ...as('a1', { type: 'turn-start' }, { type: 'text-delta', delta: 'Delegating.' }, { type: 'tool-start', toolCallId: 'c2', name: 'delegate', input: {} }),
            { type: 'agent-start', agentId: 'a2', name: 'Grepper', parentAgentId: 'a1', toolCallId: 'c2' },
            ...as('a2', { type: 'turn-start' }, { type: 'text-delta', delta: 'Grandchild speaks.' }),
        );
        await frame();

        const outer = c.row('tool-c1')!;
        const nested = outer.querySelector<HTMLElement>('[data-segment-id="tool-c2"]')!;
        expect(nested, 'the nested line is drawn inside the outer transcript').not.toBeNull();
        const own = openButtonOf(outer)!;
        const inner = nested.querySelector<HTMLElement>('.aparte-tool-open')!;
        expect(own).not.toBeNull();
        expect(inner).not.toBeNull();
        expect(own).not.toBe(inner);

        markRow(outer, true);
        expect(own.getAttribute('aria-current')).toBe('true');
        expect(inner.hasAttribute('aria-current')).toBe(false);
        expect(nested.hasAttribute('data-current')).toBe(false);

        markRow(outer, false);
        expect(own.hasAttribute('aria-current')).toBe(false);
        expect(outer.hasAttribute('data-current')).toBe(false);
    });
});
