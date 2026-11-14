// @vitest-environment jsdom
/**
 * `enhanceContextMenu(region, menu)` — the same menu, opened by a right click, Shift+F10 or
 * the Menu key: at the pointer for a click, against the focused element for a key. One menu
 * serves a whole region; `onOpen(target)` says which row it was asked about.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { enhanceContextMenu } from '../menu.js';

const releases: Array<() => void> = [];
afterEach(() => {
    for (const release of releases.splice(0)) release();
    document.body.innerHTML = '';
    vi.restoreAllMocks();
});

function mount(options: Parameters<typeof enhanceContextMenu>[2] = {}) {
    document.body.innerHTML = `
        <ul id="region">
            <li><button type="button" id="row-a">Alpha</button></li>
            <li><button type="button" id="row-b">Beta</button></li>
        </ul>
        <div class="aparte-menu" role="menu" id="menu">
            <button type="button" role="menuitem">Open</button>
            <button type="button" role="menuitem">Rename</button>
        </div>
        <button type="button" id="after">After</button>`;
    const region = document.getElementById('region')!;
    const menu = document.getElementById('menu')!;
    releases.push(enhanceContextMenu(region, menu, options));
    return { region, menu, items: () => [...menu.querySelectorAll<HTMLElement>('[role="menuitem"]')] };
}

const rightClick = (target: Element, x = 50, y = 60): MouseEvent => {
    const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, composed: true, clientX: x, clientY: y, button: 2 });
    target.dispatchEvent(event);
    return event;
};
const key = (target: Element, k: string, init: KeyboardEventInit = {}): KeyboardEvent => {
    const event = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init });
    target.dispatchEvent(event);
    return event;
};
const box = (top: number, left: number, width: number, height: number): DOMRect =>
    ({ top, left, bottom: top + height, right: left + width, width, height, x: left, y: top, toJSON: () => ({}) }) as DOMRect;

describe('enhanceContextMenu', () => {
    it('a right click opens it at the pointer, takes the browser\'s menu\'s place, and says what was clicked', () => {
        vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(box(0, 0, 100, 40));
        const targets: Element[] = [];
        const { menu, items } = mount({ onOpen: (target) => { targets.push(target); } });
        const row = document.getElementById('row-b')!;
        const event = rightClick(row, 50, 60);

        expect(event.defaultPrevented, 'no browser menu over ours').toBe(true);
        expect(targets).toEqual([row]);
        expect(menu.hidden).toBe(false);
        expect(menu.style.position).toBe('fixed');
        expect(menu.style.top).toBe('60px');
        expect(menu.style.left).toBe('50px');
        expect(document.activeElement).toBe(items()[0]);
    });

    it('in a right-to-left page it opens toward the left of the pointer', () => {
        vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(box(0, 0, 100, 40));
        const { region, menu } = mount();
        region.style.direction = 'rtl';
        rightClick(document.getElementById('row-a')!, 300, 60);
        expect(menu.style.left).toBe(`${300 - 100}px`);
    });

    it('Shift+F10 opens it against the focused element, on its first item', () => {
        const row = (): HTMLElement => document.getElementById('row-a')!;
        vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
            return this.id === 'row-a' ? box(100, 20, 200, 30) : box(0, 0, 80, 40);
        });
        const targets: Element[] = [];
        const { menu, items } = mount({ onOpen: (target) => { targets.push(target); } });
        row().focus();
        const event = key(row(), 'F10', { shiftKey: true });
        expect(event.defaultPrevented).toBe(true);
        expect(targets).toEqual([row()]);
        expect(menu.hidden).toBe(false);
        // Below the row, at its start edge — not at a pointer the keyboard does not have.
        expect(menu.style.top).toBe(`${130 + 4}px`);
        expect(menu.style.left).toBe('20px');
        expect(document.activeElement).toBe(items()[0]);
    });

    it('the Menu key opens it too; F10 alone does not', () => {
        const { menu } = mount();
        const row = document.getElementById('row-a')!;
        row.focus();
        expect(key(row, 'F10').defaultPrevented).toBe(false);
        expect(menu.hidden).toBe(true);
        key(row, 'ContextMenu');
        expect(menu.hidden).toBe(false);
    });

    it('when onOpen says no, it stays shut and the browser keeps its own menu', () => {
        const { menu } = mount({ onOpen: (target) => (target.id === 'row-a' ? undefined : false) });
        const event = rightClick(document.getElementById('row-b')!);
        expect(event.defaultPrevented).toBe(false);
        expect(menu.hidden).toBe(true);
        rightClick(document.getElementById('row-a')!);
        expect(menu.hidden).toBe(false);
    });

    it('Escape closes it and gives the focus back to the element that had it', () => {
        const { menu } = mount();
        const row = document.getElementById('row-b')!;
        row.focus();
        key(row, 'F10', { shiftKey: true });
        const event = key(document.activeElement!, 'Escape');
        expect(event.defaultPrevented).toBe(true);
        expect(menu.hidden).toBe(true);
        expect(document.activeElement).toBe(row);
    });

    it('choosing an item fires aparte-menu-select and closes it', () => {
        const { menu, items } = mount();
        const seen: Element[] = [];
        menu.addEventListener('aparte-menu-select', (e) => seen.push(e.detail.item));
        rightClick(document.getElementById('row-a')!);
        items()[1]!.click();
        expect(seen).toEqual([items()[1]]);
        expect(menu.hidden).toBe(true);
    });

    it('a right click on the open menu itself neither reopens it nor shows the browser\'s', () => {
        const onOpen = vi.fn();
        const { region, menu, items } = mount({ onOpen });
        // The menu inside the region, the way a list appends it to the row it is about.
        region.append(menu);
        rightClick(document.getElementById('row-a')!);
        const event = rightClick(items()[0]!);
        expect(event.defaultPrevented).toBe(true);
        expect(onOpen).toHaveBeenCalledTimes(1);
        expect(menu.hidden).toBe(false);
    });

    it('a second right click elsewhere moves it to the new row', () => {
        const targets: string[] = [];
        const onClose = vi.fn();
        const { menu } = mount({ onOpen: (target) => { targets.push(target.id); }, onClose });
        rightClick(document.getElementById('row-a')!);
        // A real right click presses first, which closes it; this one comes without the press.
        rightClick(document.getElementById('row-b')!);
        expect(targets).toEqual(['row-a', 'row-b']);
        expect(onClose).toHaveBeenCalledTimes(1);
        expect(menu.hidden).toBe(false);
    });

    it('a press outside closes it', () => {
        const { menu } = mount();
        rightClick(document.getElementById('row-a')!);
        document.getElementById('after')!.dispatchEvent(new Event('pointerdown', { bubbles: true }));
        expect(menu.hidden).toBe(true);
    });

    it('release takes back its listeners: the region is the browser\'s again', () => {
        document.body.innerHTML = `
            <div id="region"><button type="button" id="row">Row</button></div>
            <div class="aparte-menu" role="menu" id="menu"><button type="button" role="menuitem">One</button></div>`;
        const region = document.getElementById('region')!;
        const menu = document.getElementById('menu')!;
        const release = enhanceContextMenu(region, menu);
        rightClick(document.getElementById('row')!);
        expect(menu.hidden).toBe(false);
        release();
        expect(menu.hidden).toBe(true);
        const event = rightClick(document.getElementById('row')!);
        expect(event.defaultPrevented).toBe(false);
        expect(menu.hidden).toBe(true);
        expect(key(document.getElementById('row')!, 'F10', { shiftKey: true }).defaultPrevented).toBe(false);
    });
});
