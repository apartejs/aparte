// @vitest-environment jsdom
/**
 * An open select answers the keys typed in it, and only those.
 *
 * It listened on the document: open, it took Enter, the arrows and Escape typed anywhere on the
 * page. Tab back to the composer left it open (nothing closed it), and Enter there sent the
 * message, then also switched the model and took the focus. And its Escape ran after every
 * listener on the way up: inside a launcher, the launcher closed the whole chat on the Escape
 * meant to dismiss the list.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { AparteSelect } from '../aparte-select.js';

const mounted: HTMLElement[] = [];
afterEach(() => {
    for (const el of mounted.splice(0)) el.remove();
    document.body.innerHTML = '';
});

function mountSelect(parent: HTMLElement = document.body): AparteSelect {
    const el = document.createElement('aparte-select');
    for (const value of ['one', 'two', 'three']) {
        const opt = document.createElement('aparte-option');
        opt.setAttribute('value', value);
        opt.textContent = value;
        el.appendChild(opt);
    }
    el.setAttribute('value', 'one');
    parent.appendChild(el);
    mounted.push(el);
    if (!(el instanceof AparteSelect)) throw new Error('aparte-select did not upgrade');
    return el as AparteSelect;
}

const trigger = (el: HTMLElement) => el.querySelector<HTMLElement>('.aparte-select-trigger')!;
const press = (target: EventTarget, key: string): KeyboardEvent => {
    const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
    target.dispatchEvent(event);
    return event;
};
const isOpen = (el: HTMLElement) => trigger(el).getAttribute('aria-expanded') === 'true';

describe('an open select', () => {
    it('does not answer Enter typed elsewhere on the page', () => {
        const el = mountSelect();
        const composer = document.createElement('textarea');
        document.body.appendChild(composer);
        trigger(el).focus();
        press(trigger(el), 'ArrowDown');
        press(trigger(el), 'ArrowDown');
        expect(isOpen(el)).toBe(true);
        composer.focus();
        const enter = press(composer, 'Enter');
        expect(enter.defaultPrevented, 'Enter in the composer is the composer\'s').toBe(false);
        expect(el.getAttribute('value')).toBe('one');
    });

    it('closes when Tab takes the focus out of it', () => {
        const el = mountSelect();
        trigger(el).focus();
        press(trigger(el), 'ArrowDown');
        expect(isOpen(el)).toBe(true);
        const tab = press(trigger(el), 'Tab');
        expect(tab.defaultPrevented, 'Tab still moves the focus').toBe(false);
        expect(isOpen(el)).toBe(false);
    });

    it('takes its Escape before a container that closes on an Escape nobody took', () => {
        const launcher = document.createElement('div');
        document.body.appendChild(launcher);
        let closedTheChat = false;
        launcher.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !e.defaultPrevented) closedTheChat = true; });
        const el = mountSelect(launcher);
        trigger(el).focus();
        press(trigger(el), 'ArrowDown');
        press(trigger(el), 'Escape');
        expect(isOpen(el)).toBe(false);
        expect(closedTheChat).toBe(false);
    });
});
