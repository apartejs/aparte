// @vitest-environment jsdom
/**
 * The two-button pane switch says which pane is in view.
 *
 * `[data-aparte-split-pane="start"|"end"]` switches a stacked split with no script, and a
 * screen reader heard two plain buttons: nothing said which one was on. The split now keeps
 * `aria-pressed` on every such control that reaches it. A toggle — an id, or empty — is an
 * action, not a state, and gets none. Side by side both panes are in view, so neither
 * button is pressed and none carries it.
 */
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import '../aparte-split.js';
import type { AparteSplit } from '../aparte-split.js';

/** A narrow window — the split stacks, which is when the switch shows one pane at a time — that a test can widen. */
let widen: () => void = () => {};
beforeEach(() => {
    let listener: ((e: { matches: boolean }) => void) | null = null;
    const query = { matches: true, addEventListener: (_: string, fn: (e: { matches: boolean }) => void) => { listener = fn; }, removeEventListener: () => {} };
    (globalThis as unknown as { matchMedia: unknown }).matchMedia = () => query;
    widen = () => { query.matches = false; listener?.({ matches: false }); };
});
afterEach(() => { document.body.innerHTML = ''; });

function mount(): { split: AparteSplit; start: HTMLElement; end: HTMLElement; toggle: HTMLElement } {
    document.body.innerHTML = `
        <button type="button" data-aparte-split-pane="start">Chat</button>
        <button type="button" data-aparte-split-pane="end">Preview</button>
        <button type="button" data-aparte-split-pane="">Switch</button>`;
    const split = document.createElement('aparte-split') as AparteSplit;
    split.append(document.createElement('div'), document.createElement('div'));
    document.body.appendChild(split);
    const [start, end, toggle] = Array.from(document.querySelectorAll<HTMLElement>('button'));
    return { split, start: start!, end: end!, toggle: toggle! };
}

describe('the pane switch', () => {
    it('marks the pane in view as pressed', () => {
        const { start, end } = mount();
        expect(start.getAttribute('aria-pressed')).toBe('true');
        expect(end.getAttribute('aria-pressed')).toBe('false');
    });

    it('follows a switch, by the API or by a click', () => {
        const { split, start, end } = mount();
        split.showPane('end');
        expect(end.getAttribute('aria-pressed')).toBe('true');
        expect(start.getAttribute('aria-pressed')).toBe('false');
        start.click();
        expect(start.getAttribute('aria-pressed')).toBe('true');
    });

    it('stamps only a button, and reads the value trimmed as the click does', () => {
        const { split } = mount();
        document.body.insertAdjacentHTML('afterbegin', '<a href="#" data-aparte-split-pane="end">Preview</a><button type="button" data-aparte-split-pane=" end ">Preview</button>');
        split.showPane('end');
        expect(document.querySelector('a')!.hasAttribute('aria-pressed'), 'aria-pressed means nothing on a link').toBe(false);
        expect(document.querySelector('button[data-aparte-split-pane=" end "]')!.getAttribute('aria-pressed')).toBe('true');
    });

    it('presses neither button while the split shows both panes side by side', () => {
        const { start, end } = mount();
        widen();
        expect(start.hasAttribute('aria-pressed')).toBe(false);
        expect(end.hasAttribute('aria-pressed')).toBe(false);
    });

    it('follows `single` turned on and then off on a wide split', () => {
        const { split, start, end } = mount();
        widen();
        split.single = true;
        expect(start.getAttribute('aria-pressed'), 'one pane shown: the switch says which').toBe('true');
        split.showPane('end');
        split.single = false;
        expect(start.hasAttribute('aria-pressed'), 'both panes in view again').toBe(false);
        expect(end.hasAttribute('aria-pressed')).toBe(false);
    });

    it('leaves a toggle without a pressed state', () => {
        const { toggle } = mount();
        toggle.click();
        expect(toggle.hasAttribute('aria-pressed')).toBe(false);
    });
});
