// @vitest-environment jsdom
/**
 * `enhanceMenu(trigger, menu)` — the WAI-ARIA menu button, over the kit's markup.
 *
 * The kit drew a menu and left the keyboard to every host, so every host wrote the same
 * pattern by hand and each got it wrong its own way: the conversation list had no
 * type-ahead and did not skip a disabled item, the site's theme menu had neither and no
 * outside press. One copy, here, and the places that had their own now call it.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { enhanceMenu, type AparteMenuSelectDetail } from '../menu.js';

const releases: Array<() => void> = [];
afterEach(() => {
    for (const release of releases.splice(0)) release();
    document.body.innerHTML = '';
    vi.restoreAllMocks();
    vi.useRealTimers();
});

function mount(items = ['Copy', 'Retry', 'Rename', 'Delete'], options: Parameters<typeof enhanceMenu>[2] = {}) {
    document.body.innerHTML = `
        <button type="button" id="before">Before</button>
        <button type="button" class="aparte-btn" id="trigger">Actions</button>
        <div class="aparte-menu" id="menu">
            ${items.map((label) => `<button type="button" class="aparte-menu__item" role="menuitem">${label}</button>`).join('')}
        </div>
        <button type="button" id="after">After</button>`;
    const trigger = document.getElementById('trigger')!;
    const menu = document.getElementById('menu')!;
    releases.push(enhanceMenu(trigger, menu, options));
    return { trigger, menu, items: () => [...menu.querySelectorAll<HTMLElement>('[role^="menuitem"]')] };
}

const key = (target: Element, k: string, init: KeyboardEventInit = {}): KeyboardEvent => {
    const event = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init });
    target.dispatchEvent(event);
    return event;
};
const press = (target: EventTarget, init: EventInit = { bubbles: true, composed: true }): void => {
    target.dispatchEvent(new Event('pointerdown', init));
};
const focused = (): Element | null => document.activeElement;

describe('enhanceMenu — opening', () => {
    it('starts closed, and names the button as the opener of a menu', () => {
        const { trigger, menu } = mount();
        expect(menu.hidden).toBe(true);
        expect(menu.getAttribute('role')).toBe('menu');
        expect(trigger.getAttribute('aria-haspopup')).toBe('menu');
        expect(trigger.getAttribute('aria-expanded')).toBe('false');
    });

    it('opens on a click, fixed to the window, with the focus on its first item', () => {
        const { trigger, menu, items } = mount();
        trigger.click();
        expect(menu.hidden).toBe(false);
        expect(trigger.getAttribute('aria-expanded')).toBe('true');
        expect(menu.style.position).toBe('fixed');
        expect(focused()).toBe(items()[0]);
    });

    it('a second click closes it, and the focus is back on the button', () => {
        const { trigger, menu } = mount();
        trigger.click();
        trigger.click();
        expect(menu.hidden).toBe(true);
        expect(trigger.getAttribute('aria-expanded')).toBe('false');
        expect(focused()).toBe(trigger);
    });

    it('ArrowDown on the button opens on the first item, ArrowUp on the last', () => {
        const { trigger, menu, items } = mount();
        trigger.focus();
        expect(key(trigger, 'ArrowDown').defaultPrevented).toBe(true);
        expect(focused()).toBe(items()[0]);
        key(focused()!, 'Escape');
        expect(menu.hidden).toBe(true);

        expect(key(trigger, 'ArrowUp').defaultPrevented).toBe(true);
        expect(focused()).toBe(items()[3]);
    });

    it('leaves Enter and Space to a real button, whose own click opens it', () => {
        const { trigger, menu } = mount();
        trigger.focus();
        // The browser turns them into the click; taking them here as well would open and close at once.
        expect(key(trigger, 'Enter').defaultPrevented).toBe(false);
        expect(key(trigger, ' ').defaultPrevented).toBe(false);
        expect(menu.hidden).toBe(true);
    });

    it('opens on Enter and Space when the trigger is not a button', () => {
        document.body.innerHTML = `
            <span id="trigger" role="button" tabindex="0">More</span>
            <div class="aparte-menu" role="menu" id="menu"><button type="button" role="menuitem">One</button></div>`;
        const trigger = document.getElementById('trigger')!;
        const menu = document.getElementById('menu')!;
        releases.push(enhanceMenu(trigger, menu));
        trigger.focus();
        expect(key(trigger, 'Enter').defaultPrevented).toBe(true);
        expect(menu.hidden).toBe(false);
        key(focused()!, 'Escape');
        expect(key(trigger, ' ').defaultPrevented).toBe(true);
        expect(menu.hidden).toBe(false);
    });

    it('a menu of radio items opens on the checked one', () => {
        document.body.innerHTML = `
            <button type="button" id="trigger">Theme</button>
            <div class="aparte-menu" role="menu" id="menu">
                <button type="button" role="menuitemradio" aria-checked="false">Light</button>
                <button type="button" role="menuitemradio" aria-checked="true">Dark</button>
                <button type="button" role="menuitemradio" aria-checked="false">System</button>
            </div>`;
        const trigger = document.getElementById('trigger')!;
        const menu = document.getElementById('menu')!;
        releases.push(enhanceMenu(trigger, menu));
        trigger.click();
        expect(focused()?.textContent).toBe('Dark');
    });

    it('is placed against its button, at the end edge it was asked for', () => {
        vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
            top: 100, bottom: 120, left: 200, right: 240, width: 40, height: 20, x: 200, y: 100, toJSON: () => ({}),
        } as DOMRect);
        const { trigger, menu } = mount(undefined, { align: 'end', gap: 6 });
        trigger.click();
        expect(menu.style.top).toBe('126px');
        // End-aligned: the menu's right edge on the button's (both 40 wide here).
        expect(menu.style.left).toBe('200px');
    });

    it('reads the writing direction from its button: the start edge is the right one in a right-to-left page', () => {
        vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
            const wide = this.id === 'menu';
            return { top: 100, bottom: 120, left: 300, right: 340, width: wide ? 120 : 40, height: 20, x: 300, y: 100, toJSON: () => ({}) } as DOMRect;
        });
        const { trigger, menu } = mount();
        trigger.style.direction = 'rtl';
        trigger.click();
        // Start-aligned in a right-to-left page: right edges meet, so the menu reaches left.
        expect(menu.style.left).toBe(`${340 - 120}px`);
    });

    it('lets onOpen fill it before it shows, keeps it shut when onOpen says no, and calls onClose after', () => {
        document.body.innerHTML = '<button type="button" id="trigger">More</button><div class="aparte-menu" role="menu" id="menu"></div>';
        const trigger = document.getElementById('trigger')!;
        const menu = document.getElementById('menu')!;
        let allow = false;
        const onClose = vi.fn();
        releases.push(enhanceMenu(trigger, menu, {
            onOpen: () => {
                if (!allow) return false;
                menu.innerHTML = '<button type="button" role="menuitem">Filled late</button>';
                return true;
            },
            onClose,
        }));
        trigger.click();
        expect(menu.hidden, 'onOpen returned false').toBe(true);
        expect(trigger.getAttribute('aria-expanded')).toBe('false');

        allow = true;
        trigger.click();
        expect(menu.hidden).toBe(false);
        expect(focused()?.textContent, 'the focus lands on what onOpen put there').toBe('Filled late');
        expect(onClose).not.toHaveBeenCalled();
        key(focused()!, 'Escape');
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('is one menu open at a time: opening another closes the first', () => {
        const first = mount();
        const second = document.createElement('div');
        second.innerHTML = '<button type="button" id="t2">Other</button><div class="aparte-menu" role="menu" id="m2"><button type="button" role="menuitem">X</button></div>';
        document.body.append(second);
        const t2 = document.getElementById('t2')!;
        const m2 = document.getElementById('m2')!;
        releases.push(enhanceMenu(t2, m2));

        first.trigger.click();
        t2.click();
        expect(first.menu.hidden).toBe(true);
        expect(first.trigger.getAttribute('aria-expanded')).toBe('false');
        expect(m2.hidden).toBe(false);
    });
});

describe('enhanceMenu — moving inside', () => {
    it('the arrows move through the items and wrap round; Home and End jump to the ends', () => {
        const { trigger, items } = mount();
        trigger.click();
        const [a, b, , d] = items();
        expect(key(focused()!, 'ArrowDown').defaultPrevented).toBe(true);
        expect(focused()).toBe(b);
        key(focused()!, 'ArrowUp');
        key(focused()!, 'ArrowUp');
        expect(focused(), 'from the first, up wraps to the last').toBe(d);
        key(focused()!, 'ArrowDown');
        expect(focused(), 'and from the last, down wraps to the first').toBe(a);
        key(focused()!, 'End');
        expect(focused()).toBe(d);
        key(focused()!, 'Home');
        expect(focused()).toBe(a);
    });

    it('skips an item that is disabled, aria-disabled or hidden', () => {
        const { trigger, items } = mount(['One', 'Two', 'Three', 'Four', 'Five']);
        const [one, two, three, four, five] = items();
        (two as HTMLButtonElement).disabled = true;
        three!.setAttribute('aria-disabled', 'true');
        five!.hidden = true;
        trigger.click();
        expect(focused()).toBe(one);
        key(focused()!, 'ArrowDown');
        expect(focused()).toBe(four);
        key(focused()!, 'ArrowDown');
        expect(focused(), 'Five is hidden: the next one is One again').toBe(one);
        key(focused()!, 'End');
        expect(focused()).toBe(four);
    });

    it('skips a first item that cannot be used when it opens', () => {
        const { trigger, items } = mount(['One', 'Two']);
        (items()[0] as HTMLButtonElement).disabled = true;
        trigger.click();
        expect(focused()).toBe(items()[1]);
    });

    it('a letter moves to the next item that starts with it, and the same letter again cycles', () => {
        const { trigger } = mount(['Copy', 'Retry', 'Rename', 'Delete']);
        vi.useFakeTimers();
        trigger.click();
        expect(key(focused()!, 'r').defaultPrevented).toBe(true);
        expect(focused()?.textContent).toBe('Retry');
        key(focused()!, 'r');
        expect(focused()?.textContent, 'r again: the next r').toBe('Rename');
        key(focused()!, 'R');
        expect(focused()?.textContent, 'and round again, case aside').toBe('Retry');
    });

    it('letters typed quickly are one word, and a pause starts a new one', () => {
        const { trigger } = mount(['Copy', 'Retry', 'Rename', 'Delete']);
        vi.useFakeTimers();
        trigger.click();
        key(focused()!, 'r');
        key(focused()!, 'e');
        key(focused()!, 'n');
        expect(focused()?.textContent, '"ren" is Rename, not the first r').toBe('Rename');
        vi.advanceTimersByTime(800);
        key(focused()!, 'd');
        expect(focused()?.textContent).toBe('Delete');
    });

    it('type-ahead passes over a disabled item and leaves a letter that matches nothing alone', () => {
        const { trigger, items } = mount(['Copy', 'Retry', 'Rename']);
        (items()[1] as HTMLButtonElement).disabled = true;
        vi.useFakeTimers();
        trigger.click();
        key(focused()!, 'r');
        expect(focused()?.textContent).toBe('Rename');
        vi.advanceTimersByTime(800);
        key(focused()!, 'z');
        expect(focused()?.textContent).toBe('Rename');
    });

    it('leaves a key with Ctrl, Alt or Meta to the page', () => {
        const { trigger } = mount();
        trigger.click();
        expect(key(focused()!, 'c', { ctrlKey: true }).defaultPrevented).toBe(false);
        expect(focused()?.textContent).toBe('Copy');
    });
});

describe('enhanceMenu — closing', () => {
    it('Escape closes it, gives the focus back to the button, and is spent', () => {
        const { trigger, menu } = mount();
        trigger.click();
        const event = key(focused()!, 'Escape');
        expect(event.defaultPrevented, 'a dialog around it does not close too').toBe(true);
        expect(menu.hidden).toBe(true);
        expect(trigger.getAttribute('aria-expanded')).toBe('false');
        expect(focused()).toBe(trigger);
    });

    it('Tab closes it from the button, and leaves the key to the browser to move on', () => {
        const { trigger, menu } = mount();
        trigger.click();
        const event = key(focused()!, 'Tab');
        expect(menu.hidden).toBe(true);
        expect(focused()).toBe(trigger);
        expect(event.defaultPrevented, 'the browser moves on from the button, past the menu').toBe(false);
    });

    it('choosing an item fires aparte-menu-select with it, then closes and returns the focus', () => {
        const { trigger, menu, items } = mount();
        const seen: AparteMenuSelectDetail[] = [];
        let openWhenFired = false;
        menu.addEventListener('aparte-menu-select', (e) => {
            seen.push(e.detail);
            openWhenFired = !menu.hidden;
        });
        trigger.click();
        items()[1]!.click();
        expect(seen.map((d) => d.item)).toEqual([items()[1]]);
        expect(openWhenFired, 'the event comes first, while it is still open').toBe(true);
        expect(menu.hidden).toBe(true);
        expect(focused()).toBe(trigger);
    });

    it('a checkbox or radio item is named by the event, and its state stays the app\'s', () => {
        document.body.innerHTML = `
            <button type="button" id="trigger">View</button>
            <div class="aparte-menu" role="menu" id="menu">
                <button type="button" role="menuitemcheckbox" aria-checked="false">Wrap lines</button>
            </div>`;
        const trigger = document.getElementById('trigger')!;
        const menu = document.getElementById('menu')!;
        releases.push(enhanceMenu(trigger, menu));
        const item = menu.querySelector<HTMLElement>('[role="menuitemcheckbox"]')!;
        trigger.click();
        item.click();
        expect(item.getAttribute('aria-checked'), 'nothing ticks it but the app').toBe('false');

        menu.addEventListener('aparte-menu-select', (e) => {
            const chosen = e.detail.item;
            chosen.setAttribute('aria-checked', String(chosen.getAttribute('aria-checked') !== 'true'));
        });
        trigger.click();
        item.click();
        expect(item.getAttribute('aria-checked')).toBe('true');
    });

    it('preventDefault() on aparte-menu-select keeps it open', () => {
        const { trigger, menu, items } = mount();
        menu.addEventListener('aparte-menu-select', (e) => e.preventDefault());
        trigger.click();
        items()[0]!.click();
        expect(menu.hidden).toBe(false);
    });

    it('a button inside it that is not an item closes it too — the answer to a question it now asks', () => {
        const { trigger, menu } = mount();
        trigger.click();
        menu.innerHTML = '<p>Delete it?</p><button type="button" id="cancel">Cancel</button>';
        const seen: Element[] = [];
        menu.addEventListener('aparte-menu-select', (e) => seen.push(e.detail.item));
        document.getElementById('cancel')!.click();
        expect(seen.map((el) => el.id)).toEqual(['cancel']);
        expect(menu.hidden).toBe(true);
    });

    it('an aria-disabled item does nothing on a click', () => {
        const { trigger, menu, items } = mount();
        items()[0]!.setAttribute('aria-disabled', 'true');
        const seen = vi.fn();
        menu.addEventListener('aparte-menu-select', seen);
        trigger.click();
        items()[0]!.click();
        expect(seen).not.toHaveBeenCalled();
        expect(menu.hidden).toBe(false);
    });

    it('Enter and Space on an item that is not a button choose it', () => {
        document.body.innerHTML = `
            <button type="button" id="trigger">More</button>
            <div class="aparte-menu" role="menu" id="menu"><div role="menuitem" tabindex="-1">Plain</div></div>`;
        const trigger = document.getElementById('trigger')!;
        const menu = document.getElementById('menu')!;
        releases.push(enhanceMenu(trigger, menu));
        const seen = vi.fn();
        menu.addEventListener('aparte-menu-select', seen);
        trigger.click();
        expect(key(focused()!, 'Enter').defaultPrevented).toBe(true);
        expect(seen).toHaveBeenCalledTimes(1);
        trigger.click();
        key(focused()!, ' ');
        expect(seen).toHaveBeenCalledTimes(2);
    });

    it('a press outside closes it without taking the focus; a press on the button or inside does not', () => {
        const { trigger, menu, items } = mount();
        trigger.click();
        press(trigger);
        expect(menu.hidden, 'the button\'s own click toggles').toBe(false);
        press(items()[2]!);
        expect(menu.hidden).toBe(false);

        const after = document.getElementById('after')!;
        press(after);
        expect(menu.hidden).toBe(true);
        expect(focused(), 'the focus is not pulled back to the button').not.toBe(trigger);
    });

    it('reads a press from inside a shadow root where it started, not at the host', () => {
        const host = document.createElement('div');
        document.body.append(host);
        const root = host.attachShadow({ mode: 'open' });
        root.innerHTML = `
            <button type="button" id="trigger">More</button>
            <div class="aparte-menu" role="menu" id="menu"><button type="button" role="menuitem">One</button></div>
            <button type="button" id="other">Other</button>`;
        const trigger = root.getElementById('trigger')!;
        const menu = root.getElementById('menu')!;
        releases.push(enhanceMenu(trigger, menu));
        trigger.click();
        // Seen from `document`, both presses come from the host; only the path tells them apart.
        press(menu.querySelector('[role="menuitem"]')!);
        expect(menu.hidden, 'a press on an item is inside').toBe(false);
        press(root.getElementById('other')!);
        expect(menu.hidden, 'a press beside it, in the same shadow root, is outside').toBe(true);
    });

    it('closes when the focus leaves for somewhere else', () => {
        const { trigger, menu } = mount();
        trigger.click();
        const after = document.getElementById('after')!;
        focused()!.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: after }));
        expect(menu.hidden).toBe(true);
    });

    it('stays open when the focus moves between its items', () => {
        const { trigger, menu, items } = mount();
        trigger.click();
        focused()!.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: items()[2]! }));
        expect(menu.hidden).toBe(false);
    });

    it('stays open when a press inside blurs the item with nowhere to go (WebKit does not focus a pressed button)', () => {
        const { trigger, menu, items } = mount();
        trigger.click();
        const held = focused()!;
        press(items()[2]!);
        held.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: null }));
        expect(menu.hidden).toBe(false);

        document.dispatchEvent(new Event('pointerup', { bubbles: true }));
        held.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: null }));
        expect(menu.hidden, 'with no press held, a blur to nowhere is the focus leaving').toBe(true);
    });

    it('closes on a scroll anywhere or a resize: it was placed once', () => {
        const { trigger, menu } = mount();
        trigger.click();
        document.dispatchEvent(new Event('scroll'));
        expect(menu.hidden).toBe(true);
        trigger.click();
        window.dispatchEvent(new Event('resize'));
        expect(menu.hidden).toBe(true);
    });

    it('a scroll of its own list does not close it', () => {
        const { trigger, menu } = mount();
        trigger.click();
        menu.dispatchEvent(new Event('scroll'));
        expect(menu.hidden).toBe(false);
    });
});

describe('enhanceMenu — release', () => {
    it('closes an open menu, takes back every listener, and every attribute it added to wire the pattern', () => {
        document.body.innerHTML = `
            <button type="button" id="trigger">More</button>
            <div class="aparte-menu" id="menu" style="color: red"><button type="button" role="menuitem">One</button></div>
            <button type="button" id="after">After</button>`;
        const trigger = document.getElementById('trigger')!;
        const menu = document.getElementById('menu')!;
        const added = vi.spyOn(document, 'addEventListener');
        const removed = vi.spyOn(document, 'removeEventListener');
        const addedOnWindow = vi.spyOn(window, 'addEventListener');
        const removedOnWindow = vi.spyOn(window, 'removeEventListener');
        const release = enhanceMenu(trigger, menu);
        trigger.click();
        expect(menu.hidden).toBe(false);

        release();
        expect(menu.hidden, 'closed on the way out, and left closed').toBe(true);
        expect(trigger.hasAttribute('aria-haspopup')).toBe(false);
        expect(trigger.hasAttribute('aria-expanded')).toBe(false);
        expect(menu.hasAttribute('role')).toBe(false);
        expect(menu.getAttribute('style'), 'its own inline style is kept, the placement is not').toBe('color: red;');
        expect(added.mock.calls.length).toBeGreaterThan(0);
        expect(removed.mock.calls.length).toBe(added.mock.calls.length);
        expect(removedOnWindow.mock.calls.length).toBe(addedOnWindow.mock.calls.length);

        trigger.click();
        key(trigger, 'ArrowDown');
        expect(menu.hidden, 'nothing answers any more').toBe(true);
        expect(trigger.hasAttribute('aria-expanded')).toBe(false);
    });

    it('keeps the attributes the markup already had, as they were', () => {
        document.body.innerHTML = `
            <button type="button" id="trigger" aria-haspopup="true" aria-expanded="false">More</button>
            <div class="aparte-menu" role="menu" id="menu" hidden><button type="button" role="menuitem">One</button></div>`;
        const trigger = document.getElementById('trigger')!;
        const menu = document.getElementById('menu')!;
        const release = enhanceMenu(trigger, menu);
        expect(trigger.getAttribute('aria-haspopup'), 'an author\'s value is not overwritten').toBe('true');
        release();
        expect(trigger.getAttribute('aria-expanded')).toBe('false');
        expect(menu.getAttribute('role')).toBe('menu');
        expect(menu.hidden).toBe(true);
    });
});
