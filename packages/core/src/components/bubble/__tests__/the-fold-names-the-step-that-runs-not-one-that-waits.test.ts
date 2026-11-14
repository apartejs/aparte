// @vitest-environment jsdom
/**
 * The fold's live line names the step that runs, not one that waits its turn.
 *
 * A step's calls can be on screen before they run: a call that waits its place in its step is
 * drawn where the model wrote it, `queued`. The fold's line names what is being done now, so it
 * names the latest call that is not queued; the turn is still working while one waits.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import '../aparte-chat-bubble.js';
import { aparteGlobalConfig } from '../../../config/index.js';
import { registerDefaultRenderers } from '../../../renderers/index.js';
import type { AparteSegment } from '../../../types/index.js';

type BubbleEl = HTMLElement & { addSegment(segment: AparteSegment): void; updateSegment(id: string, u: Partial<AparteSegment>): void };

function bubble(): BubbleEl {
    const el = document.createElement('aparte-chat-bubble') as BubbleEl;
    el.setAttribute('data-role', 'assistant');
    el.setAttribute('message-id', 'a1');
    el.setAttribute('streaming', '');
    document.body.appendChild(el);
    return el;
}

const call = (id: string, name: string, queued = false): AparteSegment => ({
    id: `tool-${id}`, type: 'tool_call', status: 'pending', toolCall: { id, name, input: {} }, ...(queued ? { queued: true } : {}),
} as AparteSegment);

const line = (el: HTMLElement) => ({
    label: el.querySelector('.aparte-turn > summary > .aparte-turn__label')!.textContent,
    current: el.querySelector('.aparte-turn > summary > .aparte-turn__current')!.textContent,
});

describe('the fold of a turn with a queued call', () => {
    beforeEach(() => {
        registerDefaultRenderers();
        aparteGlobalConfig.setTurnSummary(true);
    });
    afterEach(() => {
        aparteGlobalConfig.reset();
        registerDefaultRenderers();
        document.body.innerHTML = '';
    });

    it('names the call that runs, and still says it works', () => {
        const el = bubble();
        el.addSegment(call('a', 'edit_file'));
        el.addSegment(call('b', 'run_command', true));
        expect(line(el).current).toBe('edit_file');
        expect(line(el).label).toBe(aparteGlobalConfig.t('turnWorking'));
    });

    it('draws the queued row as waiting, and as running once the call goes on', () => {
        aparteGlobalConfig.setTurnSummary(false);
        const el = bubble();
        el.addSegment(call('b', 'run_command', true));
        const row = () => el.querySelector<HTMLElement>('[data-segment-id="tool-b"]')!;
        expect(row().hasAttribute('data-queued')).toBe(true);
        expect(row().querySelector('.aparte-tool-state')!.textContent).toBe('Queued');
        el.updateSegment('tool-b', { queued: undefined } as Partial<AparteSegment>);
        expect(row().hasAttribute('data-queued')).toBe(false);
        expect(row().querySelector('.aparte-tool-state')!.textContent).toBe('Running');
    });

    it('names the call that runs, not one a paused server run left waiting its turn', () => {
        const el = bubble();
        el.addSegment(call('a', 'read_file'));
        el.addSegment({ ...call('b', 'run_command'), deferred: { reason: 'queued', ticket: 'T' } } as AparteSegment);
        expect(line(el).current).toBe('read_file');
    });

    it('names the queued call once it goes on', () => {
        const el = bubble();
        el.addSegment(call('a', 'edit_file'));
        el.addSegment(call('b', 'run_command', true));
        el.updateSegment('tool-a', { status: 'resolved', result: 'ok' } as Partial<AparteSegment>);
        el.updateSegment('tool-b', { queued: undefined } as Partial<AparteSegment>);
        expect(line(el).current).toBe('run_command');
    });
});
