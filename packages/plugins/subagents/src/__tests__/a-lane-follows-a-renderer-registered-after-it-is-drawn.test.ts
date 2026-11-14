/**
 * A sub-agent's conversation follows the renderers registered after it was drawn, as a bubble
 * does: an activity renderer registered once the lane is on screen draws the activity there, a
 * tool renderer draws the sub-agent's call, and taking one off draws the row back as core does —
 * under its line and in a standalone `<aparte-subagent-view>`, with no new event from the stream.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { aparteGlobalConfig } from '@aparte/core';
import { setupSubagents } from '../index.js';
import { as, chat, frame } from './harness.js';

let stop: (() => void) | undefined;
afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = '';
    stop?.();
    aparteGlobalConfig.reset();
});

async function finished() {
    const c = chat();
    c.run(
        { type: 'run-start' },
        { type: 'tool-start', toolCallId: 'c1', name: 'delegate', input: {} },
        { type: 'agent-start', agentId: 'a1', name: 'Researcher', description: 'Read the sources', toolCallId: 'c1' },
        ...as('a1',
            { type: 'turn-start' },
            { type: 'activity', id: 'p1', activityType: 'search-progress', content: { read: 3, of: 5 } },
            { type: 'tool-start', toolCallId: 'r1', name: 'read_source', input: { url: 'a' } },
            { type: 'tool-resolved', toolCallId: 'r1', result: 'read' },
            { type: 'text-delta', delta: 'Read.' },
            { type: 'text-flush' },
        ),
        { type: 'agent-end', agentId: 'a1', status: 'done', result: 'Read.' },
    );
    await frame();
    return c;
}

const progress = () => aparteGlobalConfig.registerActivityRenderer('search-progress', {
    render: (s) => {
        const el = document.createElement('p');
        el.className = 'search-progress';
        const { read, of } = s.content as { read: number; of: number };
        el.textContent = `${read} of ${of} sources read`;
        return el;
    },
});

const transcriptOf = (c: { row(id: string): HTMLElement | null }) =>
    c.row('tool-c1')?.querySelector<HTMLElement>(':scope > .aparte-tool-detail > aparte-subagent-view') ?? null;

function standalone(): HTMLElement {
    const view = document.createElement('aparte-subagent-view');
    view.setAttribute('for', 'chat-1');
    view.setAttribute('message-id', 'a1');
    view.setAttribute('agent-id', 'a1');
    document.body.append(view);
    return view;
}

describe('a lane follows a renderer registered after it is drawn', () => {
    it('draws an activity under its line once its renderer arrives, and hides it again once it leaves', async () => {
        stop = setupSubagents({ details: 'transcript' });
        const c = await finished();
        const view = transcriptOf(c)!;
        expect(view.querySelector('.search-progress')).toBeNull();
        const off = progress();
        await frame();
        expect(view.querySelector('.search-progress')?.textContent).toBe('3 of 5 sources read');
        off();
        await frame();
        expect(view.querySelector('.search-progress')).toBeNull();
        expect(view.querySelector<HTMLElement>('[data-segment-id="activity-p1"]')?.hidden).toBe(true);
    });

    it('draws it in a standalone view too', async () => {
        stop = setupSubagents();
        await finished();
        const view = standalone();
        expect(view.querySelector('.search-progress')).toBeNull();
        progress();
        await frame();
        expect(view.querySelector('.search-progress')?.textContent).toBe('3 of 5 sources read');
    });

    it('draws a sub-agent’s call with a tool renderer registered later', async () => {
        stop = setupSubagents({ details: 'transcript' });
        const c = await finished();
        const view = transcriptOf(c)!;
        expect(view.querySelector('.read-source-card')).toBeNull();
        aparteGlobalConfig.registerToolRenderer('read_source', {
            render: () => {
                const el = document.createElement('div');
                el.className = 'read-source-card';
                el.textContent = 'Source read';
                return el;
            },
        });
        await frame();
        expect(view.querySelector('.read-source-card')?.textContent).toBe('Source read');
    });
});
