/**
 * A sub-agent's activity is drawn in its own conversation, never in the reply: under its line
 * (`details: 'transcript'`) and in `<aparte-subagent-view>`, by the renderer the app
 * registered for the activity's type, and updated in place there as the sub-agent sends it
 * again. Without a renderer it draws nothing in the lane either.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { aparteGlobalConfig, type AparteActivitySegment } from '@aparte/core';
import { setupSubagents } from '../index.js';
import { as, chat, frame } from './harness.js';

let stop: (() => void) | undefined;
afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = '';
    stop?.();
    aparteGlobalConfig.reset();
});

const progress = (read: number) => ({ type: 'activity' as const, id: 'p1', activityType: 'search-progress', content: { read, of: 5 } });

function counting() {
    const counts = { renders: 0, updates: 0 };
    const sentence = (s: AparteActivitySegment) => `${(s.content as { read: number }).read} of 5 sources read`;
    aparteGlobalConfig.registerActivityRenderer('search-progress', {
        render: (s) => {
            counts.renders += 1;
            const el = document.createElement('p');
            el.className = 'search-progress';
            el.textContent = sentence(s);
            return el;
        },
        update: (el, s) => { counts.updates += 1; el.textContent = sentence(s); },
    });
    return counts;
}

async function working() {
    const c = chat();
    c.run(
        { type: 'run-start' },
        { type: 'tool-start', toolCallId: 'c1', name: 'delegate', input: {} },
        { type: 'agent-start', agentId: 'a1', name: 'Researcher', description: 'Read the sources', toolCallId: 'c1' },
        ...as('a1', { type: 'turn-start' }, progress(1), { type: 'text-delta', delta: 'Reading.' }),
    );
    await frame();
    return c;
}

const transcriptOf = (c: { row(id: string): HTMLElement | null }) =>
    c.row('tool-c1')?.querySelector<HTMLElement>(':scope > .aparte-tool-detail > aparte-subagent-view') ?? null;

describe('a sub-agent\'s activity is drawn in its lane', () => {
    it('under its line, updated in place, and nowhere in the reply', async () => {
        stop = setupSubagents({ details: 'transcript' });
        const counts = counting();
        const c = await working();
        const view = transcriptOf(c)!;
        const drawn = view.querySelector<HTMLElement>('.search-progress')!;
        expect(drawn.textContent).toBe('1 of 5 sources read');

        c.run(...as('a1', progress(4)));
        await frame();
        expect(view.querySelector('.search-progress')).toBe(drawn);
        expect(drawn.textContent).toBe('4 of 5 sources read');
        expect(counts.updates).toBeGreaterThanOrEqual(1);
        expect(view.querySelectorAll('.search-progress')).toHaveLength(1);
        // The reply holds the sub-agent's line only.
        expect(c.segments().map((s) => s.id)).toEqual(['tool-c1']);
    });

    it('in <aparte-subagent-view>, by the same renderer', async () => {
        stop = setupSubagents();
        counting();
        const c = await working();
        const view = document.createElement('aparte-subagent-view');
        view.setAttribute('for', 'chat-1');
        view.setAttribute('message-id', 'a1');
        view.setAttribute('agent-id', 'a1');
        document.body.append(view);
        expect(view.querySelector('.search-progress')?.textContent).toBe('1 of 5 sources read');
        c.run(...as('a1', progress(2)));
        await frame();
        expect(view.querySelector('.search-progress')?.textContent).toBe('2 of 5 sources read');
        expect(view.querySelectorAll('.search-progress')).toHaveLength(1);
    });

    it('without a renderer, nothing of it is drawn in the lane', async () => {
        stop = setupSubagents({ details: 'transcript' });
        const c = await working();
        const view = transcriptOf(c)!;
        const row = view.querySelector<HTMLElement>('[data-segment-id="activity-p1"]');
        expect(row?.hidden).toBe(true);
        expect(row?.textContent).toBe('');
        expect(view.textContent).toContain('Reading.');
    });
});
