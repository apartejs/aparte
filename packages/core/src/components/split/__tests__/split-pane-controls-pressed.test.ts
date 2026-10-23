// @vitest-environment jsdom
/**
 * The two-button pane switch says which pane is in view.
 *
 * `[data-aparte-split-pane="start"|"end"]` switches a stacked split with no script, and a
 * screen reader heard two plain buttons: nothing said which one was on. The split now keeps
 * `aria-pressed` on every such control that reaches it. A toggle — an id, or empty — is an
 * action, not a state, and gets none.
 */
import { describe, it, expect, afterEach } from 'vitest';
import '../aparte-split.js';
import type { AparteSplit } from '../aparte-split.js';

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

    it('leaves a toggle without a pressed state', () => {
        const { toggle } = mount();
        toggle.click();
        expect(toggle.hasAttribute('aria-pressed')).toBe(false);
    });
});
