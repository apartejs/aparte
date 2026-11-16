// @vitest-environment jsdom
/**
 * The fold's line can be the app's: `setTurnSummary({ label })` is called with the steps the
 * fold holds each time they change, and a string it returns replaces core's line.
 *
 * The seam a headline over a run of steps needs — "3 sub-agents · 1 done, 2 running" — on the
 * fold core already draws, moves and keeps up to date, rather than a second grouping of rows.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import '../aparte-chat-bubble.js';
import { aparteGlobalConfig } from '../../../config/index.js';
import { registerDefaultRenderers } from '../../../renderers/index.js';
import type { AparteSegment, AparteTurnLabelContext } from '../../../types/index.js';

type BubbleEl = HTMLElement & { addSegment(segment: AparteSegment): void; updateSegment(id: string, u: Partial<AparteSegment>): void };

function bubble(): BubbleEl {
    const el = document.createElement('aparte-chat-bubble') as BubbleEl;
    el.setAttribute('data-role', 'assistant');
    el.setAttribute('message-id', 'a1');
    el.setAttribute('streaming', '');
    document.body.appendChild(el);
    return el;
}

const call = (id: string, name: string): AparteSegment => ({
    id: `tool-${id}`, type: 'tool_call', status: 'pending', toolCall: { id, name, input: {} },
} as AparteSegment);

const label = (el: HTMLElement) => el.querySelector<HTMLElement>('.aparte-turn > summary > .aparte-turn__label')!;
const current = (el: HTMLElement) => el.querySelector('.aparte-turn > summary > .aparte-turn__current')!.textContent;

describe("the fold's line, written by the app", () => {
    beforeEach(() => registerDefaultRenderers());
    afterEach(() => {
        aparteGlobalConfig.reset();
        registerDefaultRenderers();
        document.body.innerHTML = '';
        vi.restoreAllMocks();
    });

    it('replaces core\'s line and the running step\'s name, and follows the steps as they change', () => {
        const seen: Array<{ names: string[]; running: boolean }> = [];
        aparteGlobalConfig.setTurnSummary({
            label: (steps, { running }) => {
                seen.push({ names: steps.map((s) => (s as { toolCall?: { name: string } }).toolCall?.name ?? s.type), running });
                const done = steps.filter((s) => (s as { status?: string }).status === 'resolved').length;
                return `${steps.length} agents · ${done} done`;
            },
        });
        const el = bubble();
        el.addSegment(call('a', 'research'));
        el.addSegment(call('b', 'research'));
        expect(label(el).textContent).toBe('2 agents · 0 done');
        expect(current(el)).toBe('');
        expect(seen.at(-1)).toEqual({ names: ['research', 'research'], running: true });

        el.updateSegment('tool-a', { status: 'resolved', result: 'ok' } as Partial<AparteSegment>);
        expect(label(el).textContent).toBe('2 agents · 1 done');
        expect(label(el).getAttribute('aria-live')).toBe('polite');
    });

    it('null or undefined keeps core\'s line, which stays out of the live region', () => {
        aparteGlobalConfig.setTurnSummary({ label: () => null });
        const el = bubble();
        el.addSegment(call('a', 'read_file'));
        el.addSegment(call('b', 'edit_file'));
        expect(label(el).textContent).toBe(aparteGlobalConfig.t('turnWorking'));
        expect(current(el)).toBe('edit_file');

        aparteGlobalConfig.setTurnSummary(true);
        el.addSegment(call('c', 'read_file'));
        expect(label(el).hasAttribute('aria-live')).toBe(false);
    });

    it('is given the chat\'s config, for words in its language', () => {
        let context: AparteTurnLabelContext | undefined;
        aparteGlobalConfig.setTurnSummary({ label: (_steps, ctx) => { context = ctx; return undefined; } });
        const el = bubble();
        el.addSegment(call('a', 'read_file'));
        el.addSegment(call('b', 'edit_file'));
        expect(context?.config).toBe(aparteGlobalConfig);
    });

    it('one that throws leaves core\'s line and says so at the console', () => {
        const error = vi.spyOn(console, 'error').mockImplementation(() => {});
        aparteGlobalConfig.setTurnSummary({ label: () => { throw new Error('boom'); } });
        const el = bubble();
        el.addSegment(call('a', 'read_file'));
        el.addSegment(call('b', 'edit_file'));
        expect(label(el).textContent).toBe(aparteGlobalConfig.t('turnWorking'));
        expect(error).toHaveBeenCalled();
    });
});
