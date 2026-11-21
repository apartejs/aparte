// @vitest-environment jsdom
/**
 * A Stop pressed as the reply ends sends nothing.
 *
 * The person writes their next message while a reply streams, then goes to press Stop. The reply
 * ends between the press and the release (a tenth of a second is enough): the same button turns
 * back into Send, and the click that follows sent the draft, unfinished, when the person had
 * asked to stop. The keyboard path already refuses it (Enter neither sends nor stops during a
 * turn); a click now does what the button showed when it was pressed, and a Stop with nothing
 * left to stop does nothing.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import '../aparte-composer.js';
import '../aparte-composer-input.js';
import '../aparte-composer-send.js';
import type { AparteComposer } from '../aparte-composer.js';

afterEach(() => { document.body.innerHTML = ''; });

async function mount(): Promise<{ composer: AparteComposer; button: HTMLButtonElement; sent: string[] }> {
    document.body.innerHTML = '<aparte-composer><aparte-composer-input></aparte-composer-input><aparte-composer-send></aparte-composer-send></aparte-composer>';
    const composer = document.querySelector('aparte-composer') as AparteComposer;
    await vi.waitFor(() => expect(composer.querySelector('.aparte-cs-button')).toBeTruthy());
    const sent: string[] = [];
    composer.addEventListener('aparte-send', (e) => sent.push((e as CustomEvent<{ content: string }>).detail.content));
    return { composer, button: composer.querySelector<HTMLButtonElement>('.aparte-cs-button')!, sent };
}

const start = (): void => { window.dispatchEvent(new CustomEvent('aparte-message-start', { detail: { messageId: 'r1' } })); };
const done = (): void => { window.dispatchEvent(new CustomEvent('aparte-message-done', { detail: { messageId: 'r1' } })); };
const pointer = (el: Element, type: string) => el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true }));
// A click a press produced counts its presses (`detail` 1); one from the keyboard or a script
// does not (`detail` 0), as in every engine.
const pointerClick = (el: Element) => el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 }));
const keyboardClick = (el: Element) => el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 0 }));

describe('the button pressed as Stop', () => {
    it('sends nothing when the reply ended before the click', async () => {
        const { composer, button, sent } = await mount();
        start();
        composer.setValue('next question');
        expect(button.getAttribute('data-act')).toBe('stop');
        pointer(button, 'pointerdown');
        // The reply ends between the press and the release: the button reads Send again.
        done();
        expect(button.getAttribute('data-act')).toBe('send');
        pointer(button, 'pointerup');
        pointerClick(button);
        expect(sent).toEqual([]);
        expect(composer.value).toBe('next question');
    });

    it('still sends on the next press, now that it is Send', async () => {
        const { composer, button, sent } = await mount();
        start();
        composer.setValue('next question');
        pointer(button, 'pointerdown');
        done();
        pointerClick(button);
        pointer(button, 'pointerdown');
        pointerClick(button);
        expect(sent).toEqual(['next question']);
    });

    it('a click with no press first (the keyboard, a script) does what the button shows', async () => {
        const { composer, button, sent } = await mount();
        composer.setValue('hello');
        button.click();
        expect(sent).toEqual(['hello']);
    });

    // A press on Stop that never became a click: the pointer slid off before the release, or a
    // touch turned into a scroll. Its record outlived it, and the next activation from the
    // keyboard, once the reply had ended, was read as that Stop and sent nothing.
    it('a Stop press that never clicked does not eat the next Send from the keyboard', async () => {
        const { composer, button, sent } = await mount();
        start();
        composer.setValue('next question');
        pointer(button, 'pointerdown');
        pointer(button, 'pointercancel');
        done();
        expect(button.getAttribute('data-act')).toBe('send');
        keyboardClick(button);
        expect(sent).toEqual(['next question']);
    });
});
