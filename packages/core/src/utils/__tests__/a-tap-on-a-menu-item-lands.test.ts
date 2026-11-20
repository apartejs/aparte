// @vitest-environment jsdom
/**
 * A tap on a menu item lands, though its click comes after the finger is lifted.
 *
 * The menu closes when the focus leaves for nowhere, unless a press inside it is under way. That
 * press ended at `pointerup`. On a touch screen the tap's click, and on iOS the compatibility
 * `mousedown` (which blurs the focused item rather than focusing the tapped one, as WebKit does),
 * come AFTER `pointerup`, in a later task: the blur found no press under way and closed the menu,
 * and the click that followed reached an item no longer shown. Rename, Pin, Delete in a row's
 * menu did nothing on a phone. A touch press now lasts until its click.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { enhanceMenu } from '../menu.js';

const releases: Array<() => void> = [];
afterEach(() => {
    for (const release of releases.splice(0)) release();
    document.body.innerHTML = '';
    vi.useRealTimers();
});

function mount() {
    document.body.innerHTML = `
        <button type="button" class="aparte-btn" id="trigger">Actions</button>
        <div class="aparte-menu" id="menu">
            <button type="button" class="aparte-menu__item" role="menuitem">Rename</button>
            <button type="button" class="aparte-menu__item" role="menuitem">Delete</button>
        </div>`;
    const trigger = document.getElementById('trigger')!;
    const menu = document.getElementById('menu')!;
    releases.push(enhanceMenu(trigger, menu));
    return { trigger, menu, items: [...menu.querySelectorAll<HTMLElement>('[role="menuitem"]')] };
}

/** A pointer event of `type`, from a finger. */
const touch = (target: EventTarget, type: string): void => {
    const event = new Event(type, { bubbles: true, composed: true });
    Object.defineProperty(event, 'pointerType', { value: 'touch' });
    target.dispatchEvent(event);
};

describe('a tap on a menu item', () => {
    it('keeps the menu open through the blur that comes after the finger is lifted, and its click lands', async () => {
        const { trigger, menu, items } = mount();
        trigger.click();
        expect(menu.hidden).toBe(false);
        const [rename] = items;
        let renamed = 0;
        rename!.addEventListener('click', () => { renamed++; });

        touch(rename!, 'pointerdown');
        touch(rename!, 'pointerup');
        // A later task: iOS's compatibility mousedown blurs the focused item, to nowhere.
        await new Promise((r) => setTimeout(r, 0));
        (document.activeElement as HTMLElement | null)?.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: null }));
        expect(menu.hidden, 'still open for the click to come').toBe(false);
        rename!.click();
        expect(renamed).toBe(1);
    });

    it('a mouse press still ends at pointerup, as before', () => {
        const { trigger, menu, items } = mount();
        trigger.click();
        const [rename] = items;
        rename!.dispatchEvent(new Event('pointerdown', { bubbles: true, composed: true }));
        rename!.dispatchEvent(new Event('pointerup', { bubbles: true, composed: true }));
        (document.activeElement as HTMLElement | null)?.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: null }));
        expect(menu.hidden).toBe(true);
    });
});
