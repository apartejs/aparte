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
        button.click();
        expect(sent).toEqual([]);
        expect(composer.value).toBe('next question');
    });

    it('still sends on the next press, now that it is Send', async () => {
        const { composer, button, sent } = await mount();
        start();
        composer.setValue('next question');
        pointer(button, 'pointerdown');
        done();
        button.click();
        pointer(button, 'pointerdown');
        button.click();
        expect(sent).toEqual(['next question']);
    });

    it('a click with no press first (the keyboard, a script) does what the button shows', async () => {
        const { composer, button, sent } = await mount();
        composer.setValue('hello');
        button.click();
        expect(sent).toEqual(['hello']);
    });
});
