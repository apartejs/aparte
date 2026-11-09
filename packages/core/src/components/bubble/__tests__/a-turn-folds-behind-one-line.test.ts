// @vitest-environment jsdom
/**
 * `setTurnSummary`: the steps of a reply behind one line.
 *
 * Rows are MOVED into a fold, never drawn again, so what a person opened stays open while
 * a turn streams. What someone must read stays outside: a question waiting for an answer,
 * a call that failed, a card that is the result itself.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import '../aparte-chat-bubble.js';
import { aparteGlobalConfig } from '../../../config/index.js';
import { registerDefaultRenderers } from '../../../renderers/index.js';
import { pluralize } from '../../../utils/plural.js';
import { planTurns, turnDuration } from '../turn-groups.js';
import type { AparteSegment, AparteToolCallSegment } from '../../../types/index.js';

type BubbleEl = HTMLElement & {
    addSegment(segment: AparteSegment): void;
    updateSegment(id: string, updates: Partial<AparteSegment>): void;
    removeSegment(id: string): void;
    setSegments(segments: AparteSegment[]): void;
};

function bubble(streaming = false): BubbleEl {
    const el = document.createElement('aparte-chat-bubble') as BubbleEl;
    el.setAttribute('data-role', 'assistant');
    el.setAttribute('message-id', 'a1');
    if (streaming) el.setAttribute('streaming', '');
    document.body.appendChild(el);
    return el;
}

const call = (id: string, status: AparteToolCallSegment['status'] = 'resolved', name = 'search', timing?: [number, number]): AparteSegment => ({
    id: `tool-${id}`,
    type: 'tool_call',
    toolCall: { id, name, input: {} },
    status,
    ...(timing ? { meta: { aparte: { startedAt: timing[0], endedAt: timing[1] } } } : {}),
} as AparteSegment);
const thinking = (id: string): AparteSegment => ({ id, type: 'thinking', content: 'hmm', isStreaming: false } as AparteSegment);
const text = (id: string): AparteSegment => ({ id, type: 'text', content: 'words', isStreaming: false } as AparteSegment);

const turns = (el: HTMLElement) => [...el.querySelectorAll<HTMLDetailsElement>('.aparte-segments > .aparte-turn')];
const rowsIn = (turn: HTMLElement) => [...turn.querySelectorAll(':scope > .aparte-turn__body > [data-segment-id]')].map((r) => r.getAttribute('data-segment-id'));
const topLevel = (el: HTMLElement) => [...el.querySelector('.aparte-segments')!.children].map((c) => c.getAttribute('data-segment-id') ?? 'turn');
const line = (turn: HTMLElement) => turn.querySelector('.aparte-turn__label')!.textContent;

describe('planTurns', () => {
    const roles = (s: string) => planTurns([...s], (c) => (c === 'f' ? 'fold' : c === '-' ? 'skip' : 'stop'));

    it('groups a run of two or more', () => {
        expect(roles('ffsf')).toEqual([{ from: 0, to: 1 }]);
    });

    it('leaves one alone', () => {
        expect(roles('sfs')).toEqual([]);
    });

    it('passes over what it skips, without counting it or keeping it at the edges', () => {
        expect(roles('-f-f-')).toEqual([{ from: 1, to: 3 }]);
        expect(roles('f--')).toEqual([]);
    });
});

describe('turnDuration', () => {
    const timed = (a: number, b: number) => call('x', 'resolved', 'search', [a, b]);

    it('runs from the first start to the last end', () => {
        expect(turnDuration([timed(10, 20), timed(15, 40)])).toBe(30);
    });

    it('is unknown when one step was never timed', () => {
        expect(turnDuration([timed(10, 20), call('y')])).toBeUndefined();
    });
});

describe('pluralize', () => {
    it('takes the form of the count', () => {
        expect(pluralize('one:{n} tool|other:{n} tools', 1, 'en')).toBe('1 tool');
        expect(pluralize('one:{n} tool|other:{n} tools', 7, 'en')).toBe('7 tools');
    });

    it('follows a language with more forms, and falls back on other', () => {
        const forms = 'one:{n} a|few:{n} b|many:{n} c|other:{n} d';
        expect(pluralize(forms, 3, 'ru')).toBe('3 b');
        expect(pluralize(forms, 5, 'ru')).toBe('5 c');
        expect(pluralize('other:{n} d', 1, 'en')).toBe('1 d');
    });
});

describe('a turn folded behind one line', () => {
    beforeEach(() => {
        registerDefaultRenderers();
        aparteGlobalConfig.setTurnSummary(true);
    });
    afterEach(() => {
        aparteGlobalConfig.reset();
        registerDefaultRenderers();
        document.body.innerHTML = '';
    });

    it('draws no fold unless asked', () => {
        aparteGlobalConfig.setTurnSummary(false);
        const el = bubble();
        el.setSegments([thinking('t1'), call('a'), call('b')]);
        expect(turns(el)).toHaveLength(0);
    });

    it('folds reasoning and calls together, and leaves the text outside', () => {
        const el = bubble();
        el.setSegments([thinking('t1'), call('a'), call('b'), text('x')]);
        expect(turns(el)).toHaveLength(1);
        expect(rowsIn(turns(el)[0]!)).toEqual(['t1', 'tool-a', 'tool-b']);
        expect(topLevel(el)).toEqual(['turn', 'x']);
    });

    it('does not fold a single step', () => {
        const el = bubble();
        el.setSegments([call('a'), text('x')]);
        expect(turns(el)).toHaveLength(0);
    });

    it('makes one fold per run, text between them', () => {
        const el = bubble();
        el.setSegments([call('a'), call('b'), text('x'), call('c'), call('d')]);
        expect(turns(el).map(rowsIn)).toEqual([['tool-a', 'tool-b'], ['tool-c', 'tool-d']]);
    });

    it('takes a call out of the fold the moment it asks a person, and keeps order', () => {
        const el = bubble(true);
        el.addSegment(call('a'));
        el.addSegment(call('b', 'pending'));
        el.addSegment(call('c', 'pending'));
        expect(turns(el)).toHaveLength(1);
        el.updateSegment('tool-b', { status: 'awaiting-approval' } as Partial<AparteSegment>);
        expect(turns(el)).toHaveLength(0);
        expect(topLevel(el)).toEqual(['tool-a', 'tool-b', 'tool-c']);
    });

    it('keeps a call that failed visible, splitting the run around it', () => {
        const el = bubble();
        el.setSegments([call('a'), call('b'), call('c', 'failed'), call('d'), call('e')]);
        expect(topLevel(el)).toEqual(['turn', 'tool-c', 'turn']);
    });

    it('keeps a tool with its own renderer out of the fold', () => {
        aparteGlobalConfig.registerToolRenderer('card', { render: () => '<div>card</div>' });
        const el = bubble();
        el.setSegments([call('a'), call('b'), call('c', 'resolved', 'card')]);
        expect(rowsIn(turns(el)[0]!)).toEqual(['tool-a', 'tool-b']);
        expect(topLevel(el)).toEqual(['turn', 'tool-c']);
    });

    it('neither counts a hidden tool nor breaks the run on it', () => {
        aparteGlobalConfig.registerToolDisplay('secret', { hidden: true });
        const el = bubble();
        el.setSegments([call('a', 'resolved', 'search', [0, 2000]), call('h', 'resolved', 'secret', [0, 2000]), call('b', 'resolved', 'search', [0, 2000])]);
        expect(turns(el)).toHaveLength(1);
        expect(line(turns(el)[0]!)).toContain('2 tools');
    });

    it('says it is working while the reply streams on from it, then what it did', () => {
        const el = bubble(true);
        el.addSegment(call('a', 'resolved', 'search', [1000, 3000]));
        el.addSegment(call('b', 'resolved', 'search', [2000, 10000]));
        expect(line(turns(el)[0]!)).toBe('Working…');
        expect(turns(el)[0]!.querySelector('.aparte-turn__label')!.classList.contains('aparte-shimmer')).toBe(true);
        expect(turns(el)[0]!.querySelector('.aparte-turn__current')!.textContent).toBe('search');
        el.removeAttribute('streaming');
        expect(line(turns(el)[0]!)).toMatch(/^Worked 9.*s · 2 tools$/);
        expect(turns(el)[0]!.querySelector('.aparte-turn__current')!.textContent).toBe('');
    });

    it('stops working when text follows, even while the reply streams', () => {
        const el = bubble(true);
        el.addSegment(call('a', 'resolved', 'search', [0, 1000]));
        el.addSegment(call('b', 'resolved', 'search', [0, 1000]));
        el.addSegment({ id: 'x', type: 'text', content: 'go', isStreaming: true } as AparteSegment);
        expect(line(turns(el)[0]!)).toMatch(/^Worked/);
    });

    it('says how many tools when nothing was timed, as in a stored turn', () => {
        const el = bubble();
        el.setSegments([call('a'), call('b')]);
        expect(line(turns(el)[0]!)).toBe('Used 2 tools');
    });

    it('counts a stopped call as finished, not as running', () => {
        const el = bubble();
        el.setSegments([call('a', 'aborted'), call('b', 'aborted')]);
        expect(line(turns(el)[0]!)).toBe('Used 2 tools');
    });

    it('shows no waiting dots beside a fold that says it is working', () => {
        const el = bubble(true);
        el.addSegment(call('a'));
        el.addSegment(call('b'));
        expect(el.querySelector<HTMLElement>('.aparte-waiting')!.hidden).toBe(true);
    });

    it('keeps a row open while its fold grows', () => {
        const el = bubble(true);
        el.addSegment(thinking('t1'));
        el.addSegment(call('a'));
        const row = el.querySelector<HTMLDetailsElement>('[data-segment-id="t1"]')!;
        row.open = true;
        el.addSegment(call('b'));
        expect(el.querySelector('[data-segment-id="t1"]')).toBe(row);
        expect(row.open).toBe(true);
    });

    it('keeps the same fold, and its state, as it grows', () => {
        const el = bubble(true);
        el.addSegment(call('a'));
        el.addSegment(call('b'));
        const turn = turns(el)[0]!;
        turn.open = true;
        el.addSegment(call('c'));
        expect(turns(el)[0]).toBe(turn);
        expect(turn.open).toBe(true);
        expect(rowsIn(turn)).toEqual(['tool-a', 'tool-b', 'tool-c']);
    });

    it('still reaches a row inside a fold with an update', () => {
        const el = bubble(true);
        el.addSegment(call('a'));
        el.addSegment(call('b', 'pending'));
        el.updateSegment('tool-b', { status: 'resolved', result: 'done' } as Partial<AparteSegment>);
        expect(el.querySelector('[data-segment-id="tool-b"]')!.getAttribute('data-status')).toBe('resolved');
    });

    it('removes a row from a fold, and dissolves the fold when one is left', () => {
        const el = bubble();
        el.setSegments([call('a'), call('b')]);
        el.removeSegment('tool-a');
        expect(turns(el)).toHaveLength(0);
        expect(topLevel(el)).toEqual(['tool-b']);
    });

    it('does not let prose take an update meant for a folded row', () => {
        const el = bubble(true);
        el.addSegment(text('x'));
        const prose = el.querySelector('[data-segment-id="x"]')!;
        // What sanitized Markdown can leave: a decoy id, and a decoy of the fold around it.
        prose.innerHTML = '<div class="aparte-turn"><div class="aparte-turn__body"><span data-segment-id="tool-b" data-status="decoy">x</span></div></div>';
        el.addSegment(call('a'));
        el.addSegment(call('b', 'pending'));
        el.updateSegment('tool-b', { status: 'rejected' } as Partial<AparteSegment>);
        expect(prose.querySelector('span')!.getAttribute('data-status')).toBe('decoy');
        expect(turns(el)[0]!.querySelector('[data-segment-id="tool-b"]')!.getAttribute('data-status')).toBe('rejected');
    });

    describe('openWhileRunning', () => {
        beforeEach(() => aparteGlobalConfig.setTurnSummary({ openWhileRunning: true }));

        it('stays open while it works, and closes at the end', () => {
            const el = bubble(true);
            el.addSegment(call('a'));
            el.addSegment(call('b'));
            expect(turns(el)[0]!.open).toBe(true);
            el.removeAttribute('streaming');
            expect(turns(el)[0]!.open).toBe(false);
        });

        it('does not close a fold someone touched', () => {
            const el = bubble(true);
            el.addSegment(call('a'));
            el.addSegment(call('b'));
            turns(el)[0]!.querySelector('summary')!.click();
            turns(el)[0]!.open = true;
            el.removeAttribute('streaming');
            expect(turns(el)[0]!.open).toBe(true);
        });
    });

    it('unfolds what is on screen when turned off', async () => {
        const el = bubble();
        el.setSegments([call('a'), call('b')]);
        expect(turns(el)).toHaveLength(1);
        aparteGlobalConfig.setTurnSummary(false);
        await Promise.resolve();
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(turns(el)).toHaveLength(0);
        expect(topLevel(el)).toEqual(['tool-a', 'tool-b']);
    });
});
